import { Queue, QueueEvents, type ConnectionOptions, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { loadEnv } from '../config/env.js';

export const QUEUE_NAMES = {
  /** One job per campaign; pages the recipient table and fans out send jobs. */
  campaignDispatch: 'campaign-dispatch',
  /** One job per recipient. Rate-limited to the SES quota. */
  emailSend: 'email-send',
} as const;

export interface CampaignDispatchJob {
  campaignId: string;
  /** Set when the run came from "resume"/"retry failed" rather than a fresh start. */
  resume?: boolean;
}

export interface EmailSendJob {
  campaignId: string;
  campaignRecipientId: string;
}

export type QueueJobMap = {
  [QUEUE_NAMES.campaignDispatch]: CampaignDispatchJob;
  [QUEUE_NAMES.emailSend]: EmailSendJob;
};

/**
 * BullMQ requires `maxRetriesPerRequest: null` on the connection used by
 * blocking commands, otherwise long-lived workers die on a slow Redis.
 */
export function createRedisConnection(): Redis {
  const env = loadEnv();
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
}

/**
 * Producers (anything calling `queue.add`) must NOT share the worker's
 * settings.
 *
 * `maxRetriesPerRequest: null` tells ioredis to hold commands forever while
 * Redis is unreachable. For a worker that is correct -- it should wait out a
 * blip rather than die. For the API it is a trap: an operator pressing "Start
 * campaign" with Redis down gets a request that never returns and never errors.
 * Producers fail fast instead, so the route can answer with a real 503.
 */
export function createProducerConnection(): Redis {
  const env = loadEnv();
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    connectTimeout: 5_000,
    lazyConnect: false,
    retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2_000)),
  });
}

let sharedConnection: Redis | undefined;
let producerConnection: Redis | undefined;

/** Long-lived connection for Workers and QueueEvents (blocking commands). */
export function getRedisConnection(): Redis {
  sharedConnection ??= createRedisConnection();
  return sharedConnection;
}

function getProducerConnection(): Redis {
  producerConnection ??= createProducerConnection();
  return producerConnection;
}

/** Connection options for Workers / QueueEvents. */
export function connectionOptions(): ConnectionOptions {
  return getRedisConnection() as unknown as ConnectionOptions;
}

/** Connection options for Queue instances that only enqueue. */
export function producerConnectionOptions(): ConnectionOptions {
  return getProducerConnection() as unknown as ConnectionOptions;
}

export class QueueUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      'The background job queue (Redis) is unavailable, so the campaign was not queued. ' +
        'Start Redis and try again.',
    );
    this.name = 'QueueUnavailableError';
    this.cause = cause;
  }
}

/**
 * Wraps an enqueue so a Redis outage surfaces as a typed error rather than a
 * hung request or an opaque ioredis failure.
 */
export async function enqueueOrFail<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new QueueUnavailableError(error);
  }
}

const defaultJobOptions: JobsOptions = {
  removeOnComplete: { age: 24 * 3600, count: 5_000 },
  removeOnFail: { age: 7 * 24 * 3600, count: 10_000 },
};

let dispatchQueue: Queue<CampaignDispatchJob> | undefined;
let sendQueue: Queue<EmailSendJob> | undefined;

export function getCampaignDispatchQueue(): Queue<CampaignDispatchJob> {
  dispatchQueue ??= new Queue<CampaignDispatchJob>(QUEUE_NAMES.campaignDispatch, {
    connection: producerConnectionOptions(),
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
    },
  });
  return dispatchQueue;
}

export function getEmailSendQueue(): Queue<EmailSendJob> {
  const env = loadEnv();
  sendQueue ??= new Queue<EmailSendJob>(QUEUE_NAMES.emailSend, {
    connection: producerConnectionOptions(),
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: env.SEND_MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: env.SEND_BACKOFF_MS },
    },
  });
  return sendQueue;
}

/**
 * Deterministic job id per campaign-recipient.
 *
 * BullMQ refuses to add a job whose id already exists while it is still in the
 * queue, which gives a cheap first line of defence against double-enqueue. The
 * authoritative guard is still the conditional status update in the worker --
 * job ids are released once a job is cleaned up, this one is not.
 */
export function sendJobId(campaignRecipientId: string, attemptEpoch = 0): string {
  return `send:${campaignRecipientId}:${attemptEpoch}`;
}

export function dispatchJobId(campaignId: string, epoch: number): string {
  return `dispatch:${campaignId}:${epoch}`;
}

export function createQueueEvents(name: string): QueueEvents {
  return new QueueEvents(name, { connection: connectionOptions() });
}

/** Closes queues and the shared Redis connection. Used by graceful shutdown. */
export async function closeQueues(): Promise<void> {
  await Promise.allSettled([dispatchQueue?.close(), sendQueue?.close()]);
  dispatchQueue = undefined;
  sendQueue = undefined;
  for (const connection of [sharedConnection, producerConnection]) {
    if (!connection) continue;
    await connection.quit().catch(() => connection.disconnect());
  }
  sharedConnection = undefined;
  producerConnection = undefined;
}

export { Queue, QueueEvents };
export type { JobsOptions, ConnectionOptions };
