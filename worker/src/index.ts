import { Worker, type Job } from 'bullmq';
import {
  closeQueues,
  connectionOptions,
  createLogger,
  disconnectPrisma,
  loadEnv,
  QUEUE_NAMES,
  type CampaignDispatchJob,
  type EmailSendJob,
} from '@mailstrive/shared';
import { processDispatch } from './processors/dispatch.processor.js';
import { processSend } from './processors/send.processor.js';
import { recoverStalledWork } from './recovery.js';

const log = createLogger('worker');

const SHUTDOWN_TIMEOUT_MS = 30_000;

async function main(): Promise<void> {
  const env = loadEnv();

  log.info(
    {
      concurrency: env.WORKER_CONCURRENCY,
      sendRate: env.SES_MAX_SEND_RATE,
      maxAttempts: env.SEND_MAX_ATTEMPTS,
      dryRun: env.SES_SANDBOX_DRY_RUN,
    },
    'Starting email worker',
  );

  await recoverStalledWork();

  const dispatchWorker = new Worker<CampaignDispatchJob>(
    QUEUE_NAMES.campaignDispatch,
    (job) => processDispatch(job),
    {
      connection: connectionOptions(),
      // One dispatcher at a time per process: the work is IO-bound paging, and
      // serialising it keeps the enqueue order predictable.
      concurrency: 1,
    },
  );

  const sendWorker = new Worker<EmailSendJob>(
    QUEUE_NAMES.emailSend,
    (job) => processSend(job),
    {
      connection: connectionOptions(),
      concurrency: env.WORKER_CONCURRENCY,
      /**
       * The SES rate limit, enforced by BullMQ across every worker sharing this
       * Redis. Running N worker processes divides the same budget rather than
       * multiplying it, which is what makes horizontal scaling safe.
       */
      limiter: { max: env.SES_MAX_SEND_RATE, duration: 1_000 },
    },
  );

  const attachLogging = (worker: Worker<never>, name: string): void => {
    worker.on('failed', (job: Job | undefined, error: Error) => {
      log.error(
        { queue: name, jobId: job?.id, attempts: job?.attemptsMade, err: error },
        'Job failed',
      );
    });
    worker.on('error', (error: Error) => {
      log.error({ queue: name, err: error }, 'Worker error');
    });
    worker.on('stalled', (jobId: string) => {
      log.warn({ queue: name, jobId }, 'Job stalled and will be reprocessed');
    });
  };

  attachLogging(dispatchWorker as unknown as Worker<never>, QUEUE_NAMES.campaignDispatch);
  attachLogging(sendWorker as unknown as Worker<never>, QUEUE_NAMES.emailSend);

  log.info('Email worker ready');

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'Shutting down worker');

    const timer = setTimeout(() => {
      log.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    // `close()` without `force` lets in-flight sends finish, so no recipient is
    // abandoned mid-delivery during a deploy.
    await Promise.allSettled([dispatchWorker.close(), sendWorker.close()]);
    await Promise.allSettled([closeQueues(), disconnectPrisma()]);

    clearTimeout(timer);
    log.info('Worker shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    log.error({ err: reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (error) => {
    log.fatal({ err: error }, 'Uncaught exception - exiting');
    void shutdown('uncaughtException');
  });
}

main().catch((error: unknown) => {
  log.fatal({ err: error }, 'Worker failed to start');
  process.exit(1);
});
