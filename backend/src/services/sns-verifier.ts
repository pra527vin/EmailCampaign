import { createVerify } from 'node:crypto';
import { get as httpsGet } from 'node:https';

/**
 * Amazon SNS message signature verification.
 *
 * The webhook endpoint is necessarily unauthenticated -- SNS will not present a
 * session -- so the signature is the only thing standing between a stranger and
 * the ability to mark arbitrary addresses as bounced. It is verified properly:
 * the signing certificate URL is constrained to an AWS host, the certificate is
 * fetched over TLS, and the canonical string is rebuilt from the documented
 * field order rather than from whatever the caller sent.
 */

export interface SnsMessage {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation';
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL?: string;
  SigningCertUrl?: string;
  SubscribeURL?: string;
  Token?: string;
}

/** Field order is defined by AWS and differs per message type. */
const SIGNABLE_FIELDS: Record<string, string[]> = {
  Notification: ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
  SubscriptionConfirmation: [
    'Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type',
  ],
  UnsubscribeConfirmation: [
    'Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type',
  ],
};

const CERT_HOST_PATTERN = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;
const CERT_CACHE = new Map<string, string>();
const CERT_FETCH_TIMEOUT_MS = 5_000;

export class SnsVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnsVerificationError';
  }
}

function assertTrustedCertUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SnsVerificationError('SigningCertURL is not a valid URL');
  }

  if (url.protocol !== 'https:') {
    throw new SnsVerificationError('SigningCertURL must use https');
  }
  if (!CERT_HOST_PATTERN.test(url.hostname)) {
    throw new SnsVerificationError(`Untrusted SigningCertURL host: ${url.hostname}`);
  }
  if (!url.pathname.endsWith('.pem')) {
    throw new SnsVerificationError('SigningCertURL must reference a .pem file');
  }

  return url;
}

async function fetchCertificate(url: URL): Promise<string> {
  const cached = CERT_CACHE.get(url.href);
  if (cached) return cached;

  const pem = await new Promise<string>((resolvePem, reject) => {
    const request = httpsGet(url, { timeout: CERT_FETCH_TIMEOUT_MS }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new SnsVerificationError(`Certificate fetch returned ${response.statusCode}`));
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
        if (body.length > 64 * 1024) {
          request.destroy();
          reject(new SnsVerificationError('Certificate response was unreasonably large'));
        }
      });
      response.on('end', () => resolvePem(body));
    });

    request.on('timeout', () => {
      request.destroy();
      reject(new SnsVerificationError('Certificate fetch timed out'));
    });
    request.on('error', (error) => reject(error));
  });

  CERT_CACHE.set(url.href, pem);
  return pem;
}

function canonicalString(message: SnsMessage): string {
  const fields = SIGNABLE_FIELDS[message.Type];
  if (!fields) throw new SnsVerificationError(`Unsupported SNS message type: ${message.Type}`);

  const parts: string[] = [];
  for (const field of fields) {
    const value = (message as unknown as Record<string, string | undefined>)[field];
    // Optional fields (notably Subject) are omitted entirely when absent.
    if (value === undefined || value === null) continue;
    parts.push(field, value);
  }
  return `${parts.join('\n')}\n`;
}

export async function verifySnsMessage(message: SnsMessage): Promise<void> {
  const certUrl = message.SigningCertURL ?? message.SigningCertUrl;
  if (!certUrl) throw new SnsVerificationError('Message has no SigningCertURL');
  if (!message.Signature) throw new SnsVerificationError('Message has no Signature');

  // SignatureVersion 1 is SHA1withRSA, 2 is SHA256withRSA.
  const algorithm =
    message.SignatureVersion === '2'
      ? 'RSA-SHA256'
      : message.SignatureVersion === '1'
        ? 'RSA-SHA1'
        : null;
  if (!algorithm) {
    throw new SnsVerificationError(`Unsupported SignatureVersion: ${message.SignatureVersion}`);
  }

  // Reject stale messages to limit the value of a captured, valid payload.
  const age = Date.now() - new Date(message.Timestamp).getTime();
  if (!Number.isFinite(age) || age > 60 * 60 * 1000) {
    throw new SnsVerificationError('Message timestamp is missing or too old');
  }

  const certificate = await fetchCertificate(assertTrustedCertUrl(certUrl));

  const verifier = createVerify(algorithm);
  verifier.update(canonicalString(message), 'utf8');

  if (!verifier.verify(certificate, message.Signature, 'base64')) {
    throw new SnsVerificationError('SNS signature verification failed');
  }
}

/** Confirms a subscription by fetching the SubscribeURL AWS sent us. */
export async function confirmSubscription(subscribeUrl: string): Promise<void> {
  const url = new URL(subscribeUrl);
  if (url.protocol !== 'https:' || !CERT_HOST_PATTERN.test(url.hostname)) {
    throw new SnsVerificationError(`Untrusted SubscribeURL host: ${url.hostname}`);
  }

  await new Promise<void>((resolveConfirm, reject) => {
    const request = httpsGet(url, { timeout: CERT_FETCH_TIMEOUT_MS }, (response) => {
      response.resume();
      if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
        resolveConfirm();
      } else {
        reject(new SnsVerificationError(`SubscribeURL returned ${response.statusCode}`));
      }
    });
    request.on('timeout', () => {
      request.destroy();
      reject(new SnsVerificationError('SubscribeURL request timed out'));
    });
    request.on('error', reject);
  });
}
