import nodemailer, { type Transporter } from 'nodemailer';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../logger/index.js';

/**
 * SES over SMTP.
 *
 * An alternative to the SES API for accounts that only have SMTP credentials.
 * The message itself is identical -- the same MIME bytes built by `mime.ts` are
 * handed over verbatim -- so headers, the multipart/alternative structure and
 * List-Unsubscribe are unchanged. Only the wire protocol differs.
 *
 * Two things the API gives us for free have to be expressed as headers here,
 * because SMTP has nowhere else to put them:
 *   X-SES-CONFIGURATION-SET  keeps bounce/complaint events flowing to SNS
 *   X-SES-MESSAGE-TAGS       keeps per-campaign attribution on those events
 * SES strips both before delivery.
 */

const log = createLogger('smtp');

let transporter: Transporter | undefined;

/** The endpoint SES publishes for the configured region. */
export function defaultSmtpHost(): string {
  return `email-smtp.${loadEnv().AWS_REGION}.amazonaws.com`;
}

/** The regional endpoint, unless one was configured explicitly. */
export function smtpHost(): string {
  return loadEnv().SES_SMTP_HOST ?? defaultSmtpHost();
}

export function getSmtpTransport(): Transporter {
  const env = loadEnv();
  const port = env.SES_SMTP_PORT;

  transporter ??= nodemailer.createTransport({
    host: smtpHost(),
    port,
    // 465 is implicit TLS; 587 and 2587 start plaintext and STARTTLS up.
    secure: port === 465,
    requireTLS: port !== 465,
    auth: {
      user: env.SES_SMTP_USERNAME ?? '',
      pass: env.SES_SMTP_PASSWORD ?? '',
    },
    // A pool keeps the TLS handshake and AUTH out of the per-message path,
    // which dominates the cost of a small message.
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    tls: {
      // Explicit: SES presents a valid public certificate and we require it.
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
  });

  return transporter;
}

/**
 * Pulls the SES message id out of the SMTP acknowledgement.
 *
 * SES replies `250 Ok 0102018f...`, and that id is the same value SNS reports
 * as `mail.messageId` -- so it is what bounce and complaint events join on.
 * Exported for tests, since an unparsed id would silently break that join.
 */
export function parseSmtpMessageId(response: string | undefined): string | null {
  if (!response) return null;
  const match = /\b(?:Ok|queued as)\s+([0-9A-Za-z._-]{8,})/i.exec(response);
  return match?.[1] ?? null;
}

export interface SmtpSendResult {
  messageId: string;
  response: string;
}

export interface SmtpSendOptions {
  raw: string;
  /** Envelope sender: what SES uses for the Return-Path and bounce routing. */
  from: string;
  to: string;
}

export async function sendRawSmtp(options: SmtpSendOptions): Promise<SmtpSendResult> {
  const info = (await getSmtpTransport().sendMail({
    // The envelope is set explicitly so the addresses on the wire are the ones
    // we intend, never re-derived from the headers inside the message.
    envelope: { from: options.from, to: [options.to] },
    raw: options.raw,
  })) as { response?: string; messageId?: string };

  const response = info.response ?? '';
  const messageId = parseSmtpMessageId(response);

  if (!messageId) {
    // Delivery succeeded, so this must not fail the send; but without the id
    // no SNS event can be matched back to this recipient.
    log.warn({ response }, 'SES accepted the message but no message id could be parsed');
  }

  return { messageId: messageId ?? `smtp-${info.messageId ?? 'unknown'}`, response };
}

/** Connects and authenticates without sending, for the Settings page. */
export async function verifySmtpConnection(): Promise<void> {
  await getSmtpTransport().verify();
}

export function destroySmtpTransport(): void {
  transporter?.close();
  transporter = undefined;
}
