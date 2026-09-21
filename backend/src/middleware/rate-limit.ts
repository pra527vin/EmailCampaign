import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { loadEnv } from '@mailstrive/shared';

const jsonHandler = (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
  res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again.' },
  });
};

/** Baseline limit applied to the whole API surface. */
export function apiRateLimiter(): RateLimitRequestHandler {
  const env = loadEnv();
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: jsonHandler,
  });
}

/**
 * Much tighter limit for credential endpoints. Keyed by IP plus the submitted
 * identifier so one attacker cannot lock every account from a single address,
 * and a distributed attack still hits the per-account ceiling.
 */
export function authRateLimiter(): RateLimitRequestHandler {
  const env = loadEnv();
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const email = (req.body as { email?: string } | undefined)?.email;
      return `${req.ip ?? 'unknown'}:${(email ?? '').toLowerCase()}`;
    },
    handler: jsonHandler,
  });
}

/** Uploads are expensive; keep them well below the general limit. */
export function uploadRateLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: jsonHandler,
  });
}
