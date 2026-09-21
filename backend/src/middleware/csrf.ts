import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { AppError, loadEnv } from '@mailstrive/shared';

/**
 * CSRF protection for cookie-authenticated routes.
 *
 * Two independent checks, because each covers a gap in the other:
 *
 *  1. Origin/Referer must match a known origin. This stops classic form posts
 *     and is the check that works even if a token leaks.
 *  2. Double-submit token: a non-HttpOnly cookie whose value must be echoed in
 *     the `X-CSRF-Token` header. A cross-site attacker can cause the cookie to
 *     be sent but cannot read it to build the header.
 *
 * Routes authenticated by something other than the session cookie -- the SNS
 * webhook and RFC 8058 one-click unsubscribe -- are exempt by design: they are
 * called by machines that have no cookie to abuse, and each carries its own
 * cryptographic authorisation.
 */

export const CSRF_COOKIE_NAME = 'mailstrive_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function setCsrfCookie(res: Response, token: string): string {
  const env = loadEnv();
  res.cookie(CSRF_COOKIE_NAME, token, {
    // Readable by the frontend on purpose -- that is the "double submit".
    httpOnly: false,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: env.SESSION_TTL_SECONDS * 1000,
  });
  return token;
}

/** Mints a brand new token. Used on login, so a session starts with its own. */
export function issueCsrfToken(res: Response): string {
  return setCsrfCookie(res, randomBytes(32).toString('base64url'));
}

/**
 * Returns the caller's existing token, or mints one if they have none.
 *
 * Endpoints that are polled (`/auth/me`) must not rotate the token: the
 * frontend reads the cookie at request time, so replacing it mid-flight makes a
 * concurrent mutation submit a header that no longer matches, and it fails with
 * a spurious 403. Only the expiry is extended here.
 */
export function ensureCsrfToken(req: Request, res: Response): string {
  const existing = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE_NAME];
  if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) {
    return setCsrfCookie(res, existing);
  }
  return issueCsrfToken(res);
}

function allowedOrigins(): string[] {
  const env = loadEnv();
  return [env.APP_URL, env.API_PUBLIC_URL].map((url) => url.replace(/\/$/, ''));
}

function originAllowed(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const origin = new URL(value).origin;
    return allowedOrigins().some((allowed) => new URL(allowed).origin === origin);
  } catch {
    return false;
  }
}

function tokensMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function csrfProtection(options: { exemptPaths?: RegExp[] } = {}): RequestHandler {
  const exempt = options.exemptPaths ?? [];

  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    if (exempt.some((pattern) => pattern.test(req.path))) {
      next();
      return;
    }

    // A Bearer token is not attached automatically by a browser, so a request
    // authenticated that way cannot be forged cross-site.
    if (req.headers.authorization?.startsWith('Bearer ')) {
      next();
      return;
    }

    const origin = req.headers.origin ?? req.headers.referer;
    if (!originAllowed(origin)) {
      next(AppError.forbidden('Request origin is not allowed'));
      return;
    }

    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE_NAME];
    const headerToken = req.get(CSRF_HEADER_NAME) ?? undefined;

    if (!tokensMatch(cookieToken, headerToken)) {
      next(AppError.forbidden('Missing or invalid CSRF token'));
      return;
    }

    next();
  };
}
