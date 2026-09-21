import { randomUUID } from 'node:crypto';

/**
 * RFC 5322 / RFC 2045 message builder.
 *
 * We build the raw message ourselves (rather than using SES's simple `Content`
 * API) because the spec requires control over `List-Unsubscribe`,
 * `List-Unsubscribe-Post` and `Message-ID`. Everything emitted here is a
 * standards-defined header -- no spoofed or decorative headers are added.
 *
 * SPF, DKIM and DMARC are NOT set here: they are DNS records plus SES identity
 * configuration. SES signs outgoing mail with DKIM for a verified domain; the
 * application's job is only to emit a well-formed message from a verified
 * identity. See README "Domain authentication".
 */

const CRLF = '\r\n';

export interface Mailbox {
  email: string;
  name?: string | undefined;
}

export interface BuildMessageOptions {
  from: Mailbox;
  to: Mailbox;
  replyTo?: string | undefined;
  subject: string;
  html: string;
  text: string;
  /** Value for `List-Unsubscribe` -- URL and/or mailto, already bracketed by us. */
  listUnsubscribeUrl?: string | undefined;
  listUnsubscribeMailto?: string | undefined;
  /** Domain used for the right-hand side of `Message-ID`. */
  messageIdDomain?: string | undefined;
  /** Additional standards-compliant headers (e.g. X-Campaign-ID for your own ops). */
  extraHeaders?: Record<string, string | undefined>;
  date?: Date;
}

export interface BuiltMessage {
  raw: string;
  messageId: string;
  boundary: string;
}

/** True when the string is safe to place unencoded in a header value. */
function isAscii(value: string): boolean {
  return /^[\x20-\x7E]*$/.test(value);
}

/** RFC 2047 encoded-word, needed for non-ASCII display names and subjects. */
export function encodeHeaderValue(value: string): string {
  if (isAscii(value)) return value;
  // Chunk on codepoints so a multi-byte character is never split across words.
  const chunks: string[] = [];
  let current = '';
  for (const char of value) {
    if (Buffer.byteLength(current + char, 'utf8') > 45) {
      chunks.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) chunks.push(current);
  return chunks
    .map((chunk) => `=?UTF-8?B?${Buffer.from(chunk, 'utf8').toString('base64')}?=`)
    .join(`${CRLF} `);
}

/** Strips CR/LF so a caller-supplied value can never inject extra headers. */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export function formatMailbox({ email, name }: Mailbox): string {
  const address = sanitizeHeaderValue(email);
  if (!name) return address;
  const cleanName = sanitizeHeaderValue(name);
  if (isAscii(cleanName)) {
    const quoted = cleanName.replace(/(["\\])/g, '\\$1');
    return `"${quoted}" <${address}>`;
  }
  return `${encodeHeaderValue(cleanName)} <${address}>`;
}

/** RFC 2822 date, always in the sender's local offset. */
export function formatDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n: number) => String(n).padStart(2, '0');

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);

  return (
    `${days[date.getDay()]}, ${pad(date.getDate())} ${months[date.getMonth()]} ${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ` +
    `${sign}${pad(Math.floor(absolute / 60))}${pad(absolute % 60)}`
  );
}

function base64Body(content: string): string {
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  const lines: string[] = [];
  for (let index = 0; index < encoded.length; index += 76) {
    lines.push(encoded.slice(index, index + 76));
  }
  return lines.join(CRLF);
}

export function generateMessageId(domain: string): string {
  return `<${randomUUID()}@${domain}>`;
}

export function buildMimeMessage(options: BuildMessageOptions): BuiltMessage {
  const date = options.date ?? new Date();
  const domain =
    options.messageIdDomain ?? options.from.email.split('@')[1] ?? 'localhost.localdomain';
  const messageId = generateMessageId(domain);
  const boundary = `----=_MailStrive_${randomUUID().replace(/-/g, '')}`;

  const listUnsubscribeParts = [
    options.listUnsubscribeMailto ? `<mailto:${options.listUnsubscribeMailto}>` : undefined,
    options.listUnsubscribeUrl ? `<${options.listUnsubscribeUrl}>` : undefined,
  ].filter(Boolean);

  const headers: Array<[string, string | undefined]> = [
    ['From', formatMailbox(options.from)],
    ['To', formatMailbox(options.to)],
    ['Reply-To', options.replyTo ? sanitizeHeaderValue(options.replyTo) : undefined],
    ['Subject', encodeHeaderValue(sanitizeHeaderValue(options.subject))],
    ['Date', formatDate(date)],
    ['Message-ID', messageId],
    ['MIME-Version', '1.0'],
    [
      'List-Unsubscribe',
      listUnsubscribeParts.length > 0 ? listUnsubscribeParts.join(', ') : undefined,
    ],
    // RFC 8058: only meaningful alongside an https List-Unsubscribe target.
    [
      'List-Unsubscribe-Post',
      options.listUnsubscribeUrl ? 'List-Unsubscribe=One-Click' : undefined,
    ],
    ['Content-Type', `multipart/alternative; boundary="${boundary}"`],
  ];

  for (const [name, value] of Object.entries(options.extraHeaders ?? {})) {
    if (value === undefined || value === '') continue;
    headers.push([name, sanitizeHeaderValue(value)]);
  }

  const headerBlock = headers
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `${name}: ${value}`)
    .join(CRLF);

  const body = [
    '',
    'This is a message in MIME format. Your client does not support it.',
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(options.text),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(options.html),
    '',
    `--${boundary}--`,
    '',
  ].join(CRLF);

  return { raw: headerBlock + CRLF + body, messageId, boundary };
}
