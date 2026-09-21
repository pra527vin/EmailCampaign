import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadEnv } from '../config/env.js';

/**
 * Stateless, signed unsubscribe tokens.
 *
 * The token carries everything the unsubscribe endpoint needs, signed with a
 * secret that is distinct from AUTH_SECRET. Nothing extra is persisted per
 * recipient, and a leaked token cannot be mutated into one for a different
 * address without the secret.
 */

export interface UnsubscribePayload {
  /** Recipient email address. */
  e: string;
  /** Campaign id the link was rendered for (for attribution). */
  c?: string;
  /** campaign_recipients row id, when the link came from a real send. */
  r?: string;
  /** Issued-at, seconds since epoch. */
  t: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function createUnsubscribeToken(
  payload: Omit<UnsubscribePayload, 't'> & { t?: number },
  secret: string = loadEnv().UNSUBSCRIBE_SECRET,
): string {
  const body: UnsubscribePayload = {
    e: payload.e.trim().toLowerCase(),
    ...(payload.c ? { c: payload.c } : {}),
    ...(payload.r ? { r: payload.r } : {}),
    t: payload.t ?? Math.floor(Date.now() / 1000),
  };
  const encoded = b64url(JSON.stringify(body));
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyUnsubscribeToken(
  token: string,
  secret: string = loadEnv().UNSUBSCRIBE_SECRET,
): UnsubscribePayload | null {
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const encoded = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = sign(encoded, secret);

  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as UnsubscribePayload;
    if (typeof parsed?.e !== 'string' || typeof parsed?.t !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function unsubscribeUrl(token: string, appUrl: string = loadEnv().APP_URL): string {
  return `${appUrl.replace(/\/$/, '')}/unsubscribe/${token}`;
}

/**
 * One-click endpoint used by the `List-Unsubscribe` header (RFC 8058).
 * It must be an API route, not the UI page: mailbox providers POST to it
 * without a browser session.
 */
export function oneClickUnsubscribeUrl(
  token: string,
  apiUrl: string = loadEnv().API_PUBLIC_URL,
): string {
  return `${apiUrl.replace(/\/$/, '')}/api/unsubscribe/${token}`;
}
