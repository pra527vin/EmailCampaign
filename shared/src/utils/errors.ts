/** Error type carried across the API boundary with an HTTP status attached. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 500,
    readonly code: string = 'INTERNAL_ERROR',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, 400, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message = 'You do not have access to this resource'): AppError {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(resource = 'Resource'): AppError {
    return new AppError(`${resource} not found`, 404, 'NOT_FOUND');
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError(message, 409, 'CONFLICT', details);
  }

  static payloadTooLarge(message: string): AppError {
    return new AppError(message, 413, 'PAYLOAD_TOO_LARGE');
  }

  static unprocessable(message: string, details?: unknown): AppError {
    return new AppError(message, 422, 'UNPROCESSABLE_ENTITY', details);
  }

  static tooManyRequests(message = 'Too many requests'): AppError {
    return new AppError(message, 429, 'RATE_LIMITED');
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
