/**
 * Address validation for CSV import.
 *
 * Intentionally stricter than RFC 5322 (which permits quoted local parts and
 * comments that no mailbox provider accepts in practice). Rejecting these at
 * import time is what keeps the bounce rate -- and therefore the SES reputation
 * -- healthy.
 */
const EMAIL_PATTERN =
  /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

export const MAX_EMAIL_LENGTH = 254;
export const MAX_LOCAL_PART_LENGTH = 64;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return false;

  const atIndex = email.lastIndexOf('@');
  if (atIndex <= 0) return false;
  if (atIndex > MAX_LOCAL_PART_LENGTH) return false;
  if (email.includes('..')) return false;

  return EMAIL_PATTERN.test(email);
}
