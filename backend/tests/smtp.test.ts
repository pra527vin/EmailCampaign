import { describe, expect, it } from 'vitest';
import { classifySmtpError, parseSmtpMessageId } from '@mailstrive/shared';

describe('parseSmtpMessageId', () => {
  it('reads the SES message id out of a 250 acknowledgement', () => {
    // This id is what SNS reports as mail.messageId, so bounce and complaint
    // events join on it. Failing to parse it silently breaks that join.
    expect(parseSmtpMessageId('250 Ok 0100019412ab34cd-0f1e2d3c-4b5a-6789-abcd-ef0123456789-000000'))
      .toBe('0100019412ab34cd-0f1e2d3c-4b5a-6789-abcd-ef0123456789-000000');
  });

  it('accepts the "queued as" form other MTAs use', () => {
    expect(parseSmtpMessageId('250 2.0.0 Ok: queued as B4F2E1A093')).toBe('B4F2E1A093');
  });

  it('returns null rather than a wrong id when nothing matches', () => {
    expect(parseSmtpMessageId('250 Message accepted')).toBeNull();
    expect(parseSmtpMessageId(undefined)).toBeNull();
    expect(parseSmtpMessageId('')).toBeNull();
  });
});

describe('classifySmtpError', () => {
  it('treats a 4xx reply as worth retrying', () => {
    // SES answers 454 when the configured send rate is exceeded.
    const error = classifySmtpError({
      responseCode: 454,
      response: '454 4.7.0 Throttling failure: Maximum sending rate exceeded',
    });

    expect(error.retryable).toBe(true);
    expect(error.code).toBe('SMTP454');
  });

  it('treats a 5xx reply as permanent for this recipient', () => {
    const error = classifySmtpError({
      responseCode: 554,
      response: '554 Message rejected: Email address is not verified',
    });

    expect(error.retryable).toBe(false);
    expect(error.statusCode).toBe(554);
    expect(error.message).toContain('not verified');
  });

  it('does not retry a rejected login, which would fail identically', () => {
    expect(classifySmtpError({ code: 'EAUTH', message: 'Invalid login' }).retryable).toBe(false);
  });

  it('explains an unresolvable host, the usual SES_SMTP_HOST mistake', () => {
    const error = classifySmtpError({
      code: 'EDNS',
      message: 'getaddrinfo ENOTFOUND ses-smtp-user.20260616-133531',
    });

    expect(error.retryable).toBe(true);
    expect(error.message).toContain('SES_SMTP_HOST does not resolve');
    expect(error.message).toContain('email-smtp.');
  });

  it('retries a connection that never reached a reply', () => {
    expect(classifySmtpError({ code: 'ETIMEDOUT', message: 'timeout' }).retryable).toBe(true);
    expect(classifySmtpError({ code: 'ECONNECTION', message: 'refused' }).retryable).toBe(true);
  });

  it('defaults an unrecognised failure to retryable', () => {
    expect(classifySmtpError(new Error('something odd')).retryable).toBe(true);
  });

  it('prefers the server reply over the wrapper message', () => {
    const error = classifySmtpError({
      responseCode: 550,
      response: '550 5.1.1 Recipient does not exist',
      message: 'Message failed',
    });

    expect(error.message).toBe('550 5.1.1 Recipient does not exist');
  });
});
