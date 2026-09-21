import { Router } from 'express';
import { AppError, loadEnv, prisma } from '@mailstrive/shared';
import { asyncHandler } from '../middleware/error-handler.js';
import { authRateLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { currentUser, extractToken, requestContext, requireAuth } from '../middleware/auth.js';
import { ensureCsrfToken, issueCsrfToken } from '../middleware/csrf.js';
import { changePassword, login, logout } from '../services/auth.service.js';
import { changePasswordBody, loginBody } from '../validation/schemas.js';

export const authRouter = Router();

function sessionCookieOptions() {
  const env = loadEnv();
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: env.SESSION_TTL_SECONDS * 1000,
  };
}

/**
 * Issues the CSRF cookie.
 *
 * Must exist and must be safe to call unauthenticated: the double-submit check
 * on `POST /login` compares a header against this cookie, and on a fresh
 * browser there is no cookie yet. Without this bootstrap the first login of
 * every session is rejected. It is a GET, so it is not itself CSRF-protected.
 */
authRouter.get('/csrf', (req, res) => {
  res.json({ data: { csrfToken: ensureCsrfToken(req, res) } });
});

authRouter.post(
  '/login',
  authRateLimiter(),
  validate({ body: loginBody }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const result = await login(email, password, requestContext(req));

    res.cookie(loadEnv().SESSION_COOKIE_NAME, result.token, sessionCookieOptions());
    const csrfToken = issueCsrfToken(res);

    res.json({
      data: { user: result.user, expiresAt: result.expiresAt.toISOString(), csrfToken },
    });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = extractToken(req);
    if (token) await logout(token, requestContext(req));

    res.clearCookie(loadEnv().SESSION_COOKIE_NAME, { path: '/' });
    res.json({ data: { success: true } });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    // Extends the CSRF cookie's life without changing its value, so a
    // long-lived tab keeps a usable token and in-flight mutations stay valid.
    const csrfToken = ensureCsrfToken(req, res);
    res.json({ data: { user, csrfToken } });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  authRateLimiter(),
  validate({ body: changePasswordBody }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    if (currentPassword === newPassword) {
      throw AppError.badRequest('The new password must be different from the current one');
    }

    await changePassword(user.id, currentPassword, newPassword, requestContext(req));

    // Every session was revoked, including this one.
    res.clearCookie(loadEnv().SESSION_COOKIE_NAME, { path: '/' });
    res.json({ data: { success: true, reauthenticationRequired: true } });
  }),
);

authRouter.get(
  '/sessions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const sessions = await prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true },
    });
    res.json({ data: sessions });
  }),
);
