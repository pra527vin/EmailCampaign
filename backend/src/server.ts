import type { Server } from 'node:http';
import { closeQueues, createLogger, disconnectPrisma, loadEnv } from '@mailstrive/shared';
import { createApp } from './app.js';
import { pruneSessions } from './services/auth.service.js';

const log = createLogger('api');

const SESSION_PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const SHUTDOWN_TIMEOUT_MS = 15_000;

function main(): void {
  const env = loadEnv();
  const app = createApp();

  const server: Server = app.listen(env.API_PORT, env.API_HOST, () => {
    log.info(
      { port: env.API_PORT, host: env.API_HOST, env: env.NODE_ENV, dryRun: env.SES_SANDBOX_DRY_RUN },
      'API listening',
    );
    if (env.SES_SANDBOX_DRY_RUN) {
      log.warn('SES_SANDBOX_DRY_RUN is enabled - no email will actually be delivered');
    }
  });

  // Above the typical 60s ALB/ELB idle timeout, so the proxy closes first and
  // clients never see a connection reset mid-response.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const pruneTimer = setInterval(() => {
    void pruneSessions()
      .then((count) => {
        if (count > 0) log.info({ count }, 'Pruned expired sessions');
      })
      .catch((error: unknown) => log.error({ err: error }, 'Session pruning failed'));
  }, SESSION_PRUNE_INTERVAL_MS);
  pruneTimer.unref();

  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'Shutting down API');

    // Hard deadline so a stuck connection cannot block a deploy indefinitely.
    const timer = setTimeout(() => {
      log.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    server.close(() => {
      void (async () => {
        clearInterval(pruneTimer);
        await Promise.allSettled([closeQueues(), disconnectPrisma()]);
        clearTimeout(timer);
        log.info('API shutdown complete');
        process.exit(0);
      })();
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    log.error({ err: reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (error) => {
    // State is unknowable after this point; exit and let the supervisor restart.
    log.fatal({ err: error }, 'Uncaught exception - exiting');
    shutdown('uncaughtException');
  });
}

main();
