import type { RequestHandler } from 'express';
import { AppError, loadEnv, type UserRole } from '@mailstrive/shared';
import { resolveSession, type AuthenticatedUser } from '../services/auth.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/** Reads the session token from the cookie, falling back to a Bearer header. */
export function extractToken(req: Parameters<RequestHandler>[0]): string | null {
  const env = loadEnv();
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[env.SESSION_COOKIE_NAME];
  if (cookieToken) return cookieToken;

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);

  return null;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) {
    next(AppError.unauthorized());
    return;
  }

  void resolveSession(token)
    .then((user) => {
      if (!user) {
        next(AppError.unauthorized('Your session has expired. Please sign in again.'));
        return;
      }
      req.user = user;
      next();
    })
    .catch(next);
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden('This action requires elevated privileges'));
      return;
    }
    next();
  };
}

/** Narrows `req.user` for handlers mounted behind `requireAuth`. */
export function currentUser(req: Parameters<RequestHandler>[0]): AuthenticatedUser {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export function requestContext(req: Parameters<RequestHandler>[0]) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}
