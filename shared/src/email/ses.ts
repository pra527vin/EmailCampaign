import { randomUUID } from 'node:crypto';
import {
  SESv2Client,
  SendEmailCommand,
  GetAccountCommand,
  ListEmailIdentitiesCommand,
  GetEmailIdentityCommand,
  type SendEmailCommandInput,
} from '@aws-sdk/client-sesv2';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../logger/index.js';
import { buildMimeMessage, type BuildMessageOptions } from './mime.js';
import { defaultSmtpHost, sendRawSmtp } from './smtp.js';

const log = createLogger('ses');

let client: SESv2Client | undefined;

export function getSesClient(): SESv2Client {
  const env = loadEnv();
  client ??= new SESv2Client({
    region: env.AWS_REGION,
    // Omitting `credentials` lets the default provider chain pick up an
    // instance role / IRSA in production; explicit keys are for local dev.
    ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
    maxAttempts: 1, // Retries are owned by BullMQ so attempts stay observable.
  });
  return client;
}

export interface SendResult {
  messageId: string;
  /** RFC Message-ID header we generated, distinct from the SES message id. */
  headerMessageId: string;
  dryRun: boolean;
}

export class SesSendError extends Error {
  constructor(
    message: string,
    readonly code: string,
    /** Whether a later attempt could plausibly succeed. */
    readonly retryable: boolean,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'SesSendError';
  }
}

/**
 * SES error names that represent a permanent rejection for this recipient.
 * Anything else (throttling, 5xx, network) is worth another attempt.
 */
const PERMANENT_ERROR_NAMES = new Set([
  'MessageRejected',
  'MailFromDomainNotVerifiedException',
  'AccountSuspendedException',
  'SendingPausedException',
  'BadRequestException',
  'InvalidParameterValue',
  'InvalidParameterException',
  'ValidationException',
  'NotFoundException',
]);

const THROTTLE_ERROR_NAMES = new Set([
  'TooManyRequestsException',
  'ThrottlingException',
  'Throttling',
  'LimitExceededException',
  'RequestThrottled',
]);

export function classifySesError(error: unknown): SesSendError {
  const anyError = error as {
    name?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
    $retryable?: { throttling?: boolean };
  };
  const name = anyError?.name ?? 'UnknownError';
  const status = anyError?.$metadata?.httpStatusCode;
  const message = anyError?.message ?? 'Unknown SES error';

  if (THROTTLE_ERROR_NAMES.has(name) || status === 429) {
    return new SesSendError(message, name, true, status);
  }
  if (PERMANENT_ERROR_NAMES.has(name)) {
    return new SesSendError(message, name, false, status);
  }
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new SesSendError(message, name, false, status);
  }
  return new SesSendError(message, name, true, status);
}

/**
 * Maps an SMTP failure onto the same retryable/permanent decision the API path
 * makes, so the worker's retry logic does not need to know which transport was
 * used.
 *
 * SMTP reply codes carry the distinction directly: 4xx is a transient refusal
 * (SES throttling answers `454`), 5xx is a rejection that will repeat. Failures
 * that never reached a reply -- DNS, TLS, timeouts -- are worth another attempt;
 * a rejected login is not, because it will fail identically until someone
 * changes the credentials.
 */
const PERMANENT_SMTP_CODES = new Set(['EAUTH', 'EMESSAGE']);
const RETRYABLE_SMTP_CODES = new Set([
  'ECONNECTION',
  'ECONNRESET',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'ECONNREFUSED',
  'EPIPE',
]);

export function classifySmtpError(error: unknown): SesSendError {
  const smtpError = error as {
    code?: string;
    responseCode?: number;
    response?: string;
    message?: string;
  };
  const code = smtpError?.code ?? 'SmtpError';
  const status = smtpError?.responseCode;
  // The server's own reply is more specific than the wrapper message.
  const message = smtpError?.response ?? smtpError?.message ?? 'Unknown SMTP error';

  if (typeof status === 'number') {
    const permanent = status >= 500;
    return new SesSendError(message, `SMTP${status}`, !permanent, status);
  }
  if (PERMANENT_SMTP_CODES.has(code)) return new SesSendError(message, code, false, status);

  if (code === 'EDNS' || code === 'ENOTFOUND') {
    // A name that does not resolve is nearly always a mis-set SES_SMTP_HOST --
    // the SES console shows the IAM user name next to the credentials, and it
    // gets pasted here. Say so in the message the recipient row will store,
    // because that row is where someone will read it.
    return new SesSendError(
      `${message} — SES_SMTP_HOST does not resolve. Leave it blank to use ` +
        `${defaultSmtpHost()}, or set it to a real SMTP endpoint (not the IAM user name).`,
      code,
      true,
      status,
    );
  }

  if (RETRYABLE_SMTP_CODES.has(code)) return new SesSendError(message, code, true, status);

  return new SesSendError(message, code, true, status);
}

export interface SendRawEmailOptions extends BuildMessageOptions {
  configurationSetName?: string | undefined;
  /** SES message tags, surfaced on SNS events for attribution. */
  tags?: Record<string, string>;
}

/**
 * SES tag values accept only alphanumerics, underscore and dash.
 * Silently dropping an invalid tag is better than failing the send.
 */
function toMessageTags(tags: Record<string, string>): Array<{ Name: string; Value: string }> {
  const valid = /^[A-Za-z0-9_-]{1,256}$/;
  return Object.entries(tags)
    .filter(([name, value]) => valid.test(name) && valid.test(value))
    .map(([Name, Value]) => ({ Name, Value }));
}

/**
 * SMTP has no request parameters, so the configuration set and message tags
 * travel as headers. SES consumes and strips both; nothing reaches the
 * recipient. Without the configuration set header, an SMTP send produces no
 * SNS bounce or complaint events at all.
 */
function smtpOnlyHeaders(options: SendRawEmailOptions): Record<string, string | undefined> {
  const tags = options.tags ? toMessageTags(options.tags) : [];
  return {
    'X-SES-CONFIGURATION-SET': options.configurationSetName,
    ...(tags.length > 0
      ? { 'X-SES-MESSAGE-TAGS': tags.map((tag) => `${tag.Name}=${tag.Value}`).join(', ') }
      : {}),
  };
}

export async function sendRawEmail(options: SendRawEmailOptions): Promise<SendResult> {
  const env = loadEnv();
  const useSmtp = env.SES_TRANSPORT === 'smtp';

  const { raw, messageId: headerMessageId } = buildMimeMessage(
    useSmtp
      ? { ...options, extraHeaders: { ...options.extraHeaders, ...smtpOnlyHeaders(options) } }
      : options,
  );

  if (env.SES_SANDBOX_DRY_RUN) {
    log.info(
      { to: options.to.email, subject: options.subject, bytes: raw.length },
      'SES dry run - message built but not sent',
    );
    return { messageId: `dry-run-${randomUUID()}`, headerMessageId, dryRun: true };
  }

  if (useSmtp) {
    try {
      const result = await sendRawSmtp({
        raw,
        from: options.from.email,
        to: options.to.email,
      });
      return { messageId: result.messageId, headerMessageId, dryRun: false };
    } catch (error) {
      throw classifySmtpError(error);
    }
  }

  const input: SendEmailCommandInput = {
    FromEmailAddress: options.from.name
      ? `${JSON.stringify(options.from.name)} <${options.from.email}>`
      : options.from.email,
    Destination: { ToAddresses: [options.to.email] },
    Content: { Raw: { Data: Buffer.from(raw, 'utf8') } },
    ...(options.replyTo ? { ReplyToAddresses: [options.replyTo] } : {}),
    ...(options.configurationSetName
      ? { ConfigurationSetName: options.configurationSetName }
      : {}),
    ...(options.tags ? { EmailTags: toMessageTags(options.tags) } : {}),
  };

  try {
    const response = await getSesClient().send(new SendEmailCommand(input));
    if (!response.MessageId) {
      throw new SesSendError('SES returned no MessageId', 'EmptyMessageId', true);
    }
    return { messageId: response.MessageId, headerMessageId, dryRun: false };
  } catch (error) {
    if (error instanceof SesSendError) throw error;
    throw classifySesError(error);
  }
}

export interface SesAccountStatus {
  sendingEnabled: boolean;
  productionAccessEnabled: boolean;
  max24HourSend: number | null;
  maxSendRate: number | null;
  sentLast24Hours: number | null;
  enforcementStatus: string | null;
}

export async function getAccountStatus(): Promise<SesAccountStatus> {
  const response = await getSesClient().send(new GetAccountCommand({}));
  return {
    sendingEnabled: response.SendingEnabled ?? false,
    productionAccessEnabled: response.ProductionAccessEnabled ?? false,
    max24HourSend: response.SendQuota?.Max24HourSend ?? null,
    maxSendRate: response.SendQuota?.MaxSendRate ?? null,
    sentLast24Hours: response.SendQuota?.SentLast24Hours ?? null,
    enforcementStatus: response.EnforcementStatus ?? null,
  };
}

export interface SesIdentityStatus {
  identity: string;
  verified: boolean;
  identityType: string | null;
  dkimStatus: string | null;
  dkimSigningEnabled: boolean;
}

/** Verification state for the configured sender, used by the Settings page. */
export async function getIdentityStatus(identity: string): Promise<SesIdentityStatus | null> {
  try {
    const response = await getSesClient().send(
      new GetEmailIdentityCommand({ EmailIdentity: identity }),
    );
    return {
      identity,
      verified: response.VerifiedForSendingStatus ?? false,
      identityType: response.IdentityType ?? null,
      dkimStatus: response.DkimAttributes?.Status ?? null,
      dkimSigningEnabled: response.DkimAttributes?.SigningEnabled ?? false,
    };
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === 'NotFoundException') return null;
    throw classifySesError(error);
  }
}

export async function listIdentities(): Promise<string[]> {
  const response = await getSesClient().send(new ListEmailIdentitiesCommand({ PageSize: 100 }));
  return (response.EmailIdentities ?? [])
    .map((identity) => identity.IdentityName)
    .filter((name): name is string => Boolean(name));
}

export function destroySesClient(): void {
  client?.destroy();
  client = undefined;
}
