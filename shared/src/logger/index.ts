import { pino, type Logger, type LoggerOptions } from 'pino';
import { loadEnv } from '../config/env.js';

/**
 * Structured logging with hard redaction.
 *
 * The redaction paths below are the contract from the spec: credentials,
 * passwords, session tokens and rendered message bodies must never reach a log
 * sink, no matter how a caller nests them in a log object.
 */
const REDACTED_PATHS = [
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'token',
  '*.token',
  'accessToken',
  'sessionToken',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_ACCESS_KEY_ID',
  'awsSecretAccessKey',
  'secretAccessKey',
  'htmlContent',
  '*.htmlContent',
  'textContent',
  '*.textContent',
  'rawMessage',
];

export function createLogger(name: string, options: LoggerOptions = {}): Logger {
  const env = loadEnv();
  const isDev = env.NODE_ENV === 'development';

  return pino({
    name,
    level: env.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    base: { service: name, env: env.NODE_ENV },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(isDev
      ? {
          transport: {
            target: 'pino/file',
            options: { destination: 1 },
          },
        }
      : {}),
    ...options,
  });
}

export type { Logger };
