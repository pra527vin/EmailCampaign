import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { createLogger, loadEnv, prisma } from '@mailstrive/shared';
import { apiRouter } from './routes/index.js';
import { apiRateLimiter } from './middleware/rate-limit.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

const log = createLogger('api');

/**
 * Routes that authenticate themselves and must therefore bypass CSRF:
 *  - the SNS webhook (verified by AWS signature)
 *  - unsubscribe (verified by a signed token; RFC 8058 forbids extra steps)
 */
const CSRF_EXEMPT = [/^\/api\/webhooks\//, /^\/api\/unsubscribe\//];

export function createApp(): Express {
  const env = loadEnv();
  const app = express();

  // Required for correct client IPs (rate limiting, audit) behind a proxy.
  app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    const requestId = req.get('x-request-id') ?? randomUUID();
    res.setHeader('x-request-id', requestId);
    next();
  });

  app.use(
    pinoHttp({
      logger: log,
      genReqId: (_req, res) => res.getHeader('x-request-id') as string,
      autoLogging: {
        // Health checks would otherwise dominate the log volume.
        ignore: (req) => req.url === '/health' || req.url === '/api/health',
      },
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  app.use(
    helmet({
      // The API serves JSON only; a restrictive default CSP is free here.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: env.COOKIE_SECURE ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  app.use(
    cors({
      origin: [env.APP_URL],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-Id'],
      maxAge: 600,
    }),
  );

  app.use(cookieParser());

  // The SNS webhook needs the unparsed body for signature verification, so the
  // JSON parser is skipped for it and the router applies `raw()` itself.
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/webhooks/')) {
      next();
      return;
    }
    express.json({ limit: '5mb' })(req, res, next);
  });
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use('/api', apiRateLimiter());
  app.use(csrfProtection({ exemptPaths: CSRF_EXEMPT }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  /** Readiness includes the database, because an API without it is useless. */
  app.get('/api/health', (_req, res) => {
    void prisma
      .$queryRaw`SELECT 1`
      .then(() => res.json({ data: { status: 'ok', database: 'up' } }))
      .catch((error: Error) =>
        res.status(503).json({
          error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Database unavailable', details: error.message },
        }),
      );
  });

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
