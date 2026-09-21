import { z } from 'zod';

/**
 * Single validated entry point for configuration.
 *
 * Every process (API, worker, seed script) parses the same schema at boot and
 * crashes immediately on a bad value, so a misconfigured deployment fails at
 * start-up rather than half-way through a campaign.
 */

const booleanish = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((value) => value === 'true' || value === '1' || value === 'yes');

const intFromString = (fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined || value === '' ? fallback : Number(value)))
    .pipe(z.number().int().min(min).max(max));

/** Treats a blank environment value as absent. */
const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === '' ? undefined : value));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  API_PORT: intFromString(4000, 1, 65535),
  API_HOST: z.string().default('0.0.0.0'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  SESSION_TTL_SECONDS: intFromString(43_200, 60),
  SESSION_COOKIE_NAME: z.string().default('mailstrive_session'),
  COOKIE_SECURE: booleanish.default('false'),
  UNSUBSCRIBE_SECRET: z.string().min(32, 'UNSUBSCRIBE_SECRET must be at least 32 characters'),

  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  SES_FROM_EMAIL: z.string().email('SES_FROM_EMAIL must be a valid address'),
  SES_FROM_NAME: z.string().optional(),
  SES_REPLY_TO_EMAIL: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  SES_CONFIGURATION_SET: z
    .string()
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  SES_MAX_SEND_RATE: intFromString(14, 1, 10_000),
  SES_DAILY_QUOTA: intFromString(50_000, 1),
  SES_SANDBOX_DRY_RUN: booleanish.default('false'),

  /**
   * How mail reaches SES.
   *
   * `api` signs each send with SigV4 and needs an IAM access key pair. `smtp`
   * authenticates with SES SMTP credentials instead -- the same message, over
   * port 587. SMTP credentials are *not* an IAM secret key: they are generated
   * separately in the SES console and only work here.
   */
  SES_TRANSPORT: z.enum(['api', 'smtp']).default('api'),
  // A blank value in .env means "not set", not an empty host or password --
  // otherwise the regional default below would be skipped for an empty string.
  SES_SMTP_HOST: optionalString,
  SES_SMTP_PORT: intFromString(587, 1, 65_535),
  SES_SMTP_USERNAME: optionalString,
  SES_SMTP_PASSWORD: optionalString,

  WORKER_CONCURRENCY: intFromString(8, 1, 200),
  SEND_MAX_ATTEMPTS: intFromString(3, 1, 10),
  SEND_BACKOFF_MS: intFromString(5_000, 100),
  DISPATCH_BATCH_SIZE: intFromString(500, 10, 10_000),

  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_BYTES: intFromString(26_214_400, 1_024),

  RATE_LIMIT_WINDOW_MS: intFromString(60_000, 1_000),
  RATE_LIMIT_MAX: intFromString(300, 1),
  AUTH_RATE_LIMIT_MAX: intFromString(10, 1),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parses and caches `process.env`. Throws a readable error on first misuse. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  if (parsed.data.NODE_ENV === 'production' && parsed.data.SES_SANDBOX_DRY_RUN) {
    throw new Error('SES_SANDBOX_DRY_RUN must be false when NODE_ENV=production');
  }

  // Fail at boot rather than on the first send, which would already have a
  // campaign in flight and a recipient marked as attempted.
  if (
    parsed.data.SES_TRANSPORT === 'smtp' &&
    !parsed.data.SES_SANDBOX_DRY_RUN &&
    !(parsed.data.SES_SMTP_USERNAME && parsed.data.SES_SMTP_PASSWORD)
  ) {
    throw new Error(
      'SES_TRANSPORT=smtp requires SES_SMTP_USERNAME and SES_SMTP_PASSWORD ' +
        '(generate them under SES > SMTP settings; an IAM secret key will not work).',
    );
  }

  cached = parsed.data;
  return cached;
}

/** Test-only escape hatch so suites can re-parse a mutated environment. */
export function resetEnvCache(): void {
  cached = undefined;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return loadEnv()[prop as keyof Env];
  },
  has(_target, prop: string) {
    return prop in loadEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(loadEnv());
  },
  getOwnPropertyDescriptor() {
    return { enumerable: true, configurable: true };
  },
});
