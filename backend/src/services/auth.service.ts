import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppError, loadEnv, prisma, type UserRole } from '@mailstrive/shared';
import { recordAudit } from './audit.service.js';

const BCRYPT_ROUNDS = 12;

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface SessionContext {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

interface SessionTokenPayload {
  sub: string;
  sid: string;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Authenticates a user and opens a server-side session.
 *
 * The cookie holds a JWT, but the JWT alone is not sufficient: its `sid` must
 * resolve to a live `sessions` row. That is what makes logout and
 * administrative revocation take effect immediately instead of waiting for the
 * token to expire.
 */
export async function login(
  email: string,
  password: string,
  context: SessionContext,
): Promise<{ user: AuthenticatedUser; token: string; expiresAt: Date }> {
  const env = loadEnv();
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });

  // Always run a comparison so a missing account and a wrong password take a
  // comparable amount of time.
  const storedHash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const passwordMatches = await verifyPassword(password, storedHash);

  if (!user || !passwordMatches) {
    await recordAudit({
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: user?.id ?? null,
      metadata: { email: email.trim().toLowerCase() },
      ...context,
    });
    throw AppError.unauthorized('Invalid email or password');
  }

  if (!user.isActive) {
    await recordAudit({
      action: 'auth.login_blocked_inactive',
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
      ...context,
    });
    throw AppError.forbidden('This account has been deactivated');
  }

  const rawToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    },
  });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = jwt.sign({ sub: user.id, sid: session.id } satisfies SessionTokenPayload, env.AUTH_SECRET, {
    expiresIn: env.SESSION_TTL_SECONDS,
    issuer: 'mailstrive',
    audience: 'mailstrive-api',
    // The JWT id is the raw session secret; the DB stores only its hash.
    jwtid: rawToken,
  });

  await recordAudit({
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    userId: user.id,
    ...context,
  });

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    token,
    expiresAt,
  };
}

export async function resolveSession(token: string): Promise<AuthenticatedUser | null> {
  const env = loadEnv();

  let payload: SessionTokenPayload & { jti?: string };
  try {
    payload = jwt.verify(token, env.AUTH_SECRET, {
      issuer: 'mailstrive',
      audience: 'mailstrive-api',
    }) as SessionTokenPayload & { jti?: string };
  } catch {
    return null;
  }

  if (!payload.sub || !payload.sid || !payload.jti) return null;

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (session.userId !== payload.sub || !session.user.isActive) return null;

  // Guards against a forged JWT signed with a leaked key but an unknown secret.
  const presented = Buffer.from(hashToken(payload.jti));
  const stored = Buffer.from(session.tokenHash);
  if (presented.length !== stored.length || !timingSafeEqual(presented, stored)) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  };
}

export async function logout(token: string, context: SessionContext): Promise<void> {
  const env = loadEnv();
  try {
    const payload = jwt.verify(token, env.AUTH_SECRET, {
      issuer: 'mailstrive',
      audience: 'mailstrive-api',
    }) as SessionTokenPayload;

    await prisma.session.updateMany({
      where: { id: payload.sid, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await recordAudit({
      action: 'auth.logout',
      entityType: 'user',
      entityId: payload.sub,
      userId: payload.sub,
      ...context,
    });
  } catch {
    // An expired or malformed token needs no revocation; logout stays idempotent.
  }
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  context: SessionContext,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User');

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw AppError.unauthorized('Current password is incorrect');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    // Changing a password invalidates every other session.
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await recordAudit({
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: userId,
    userId,
    ...context,
  });
}

/** Removes expired and long-revoked sessions. Called on a timer by the API. */
export async function pruneSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const result = await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }] },
  });
  return result.count;
}
