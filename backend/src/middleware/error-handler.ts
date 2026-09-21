import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError, createLogger, loadEnv, QueueUnavailableError } from '@mailstrive/shared';

const log = createLogger('api:error');

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route matches ${req.method} ${req.path}` },
  });
};

interface NormalisedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

function normalise(error: unknown): NormalisedError {
  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  // A queue outage is a dependency failure, not a client mistake.
  if (error instanceof QueueUnavailableError) {
    return {
      status: 503,
      code: 'QUEUE_UNAVAILABLE',
      message: error.message,
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return {
          status: 409,
          code: 'DUPLICATE',
          message: 'A record with these values already exists',
          details: { fields: error.meta?.['target'] },
        };
      case 'P2025':
        return { status: 404, code: 'NOT_FOUND', message: 'Record not found' };
      case 'P2003':
        return {
          status: 409,
          code: 'FOREIGN_KEY_CONSTRAINT',
          message: 'The record is still referenced by other data',
        };
      default:
        break;
    }
  }

  // Multer surfaces upload limits as a coded error rather than a typed class.
  const coded = error as { code?: string; message?: string };
  if (coded?.code === 'LIMIT_FILE_SIZE') {
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Uploaded file exceeds the size limit' };
  }
  if (coded?.code === 'EBADCSRFTOKEN') {
    return { status: 403, code: 'CSRF_FAILED', message: 'Invalid or missing CSRF token' };
  }

  return { status: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' };
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const normalised = normalise(error);

  const logPayload = {
    err: error,
    method: req.method,
    path: req.path,
    status: normalised.status,
    code: normalised.code,
    requestId: res.getHeader('x-request-id'),
  };

  if (normalised.status >= 500) {
    log.error(logPayload, 'Unhandled request error');
  } else {
    log.warn(logPayload, 'Request failed');
  }

  if (res.headersSent) return;

  const body: Record<string, unknown> = {
    code: normalised.code,
    message: normalised.message,
  };
  if (normalised.details !== undefined) body['details'] = normalised.details;
  // Stacks are useful locally and are a disclosure risk anywhere else.
  if (loadEnv().NODE_ENV === 'development' && normalised.status >= 500) {
    body['stack'] = (error as Error)?.stack;
  }

  res.status(normalised.status).json({ error: body });
};

/** Wraps an async handler so rejected promises reach the error middleware. */
export function asyncHandler<T extends RequestHandler>(handler: T): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}
