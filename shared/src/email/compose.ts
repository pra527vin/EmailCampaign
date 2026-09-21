import { renderTemplate, htmlToPlainText, type RecipientVariables } from './render.js';
import { createUnsubscribeToken, oneClickUnsubscribeUrl, unsubscribeUrl } from './unsubscribe.js';

/**
 * The single place where a campaign + recipient becomes a concrete message.
 *
 * Both the worker (real send) and the API (preview) call this, which is the
 * only way "what you previewed" and "what was delivered" can be guaranteed to
 * match.
 */

export interface ComposeInput {
  subject: string;
  htmlContent: string;
  textContent?: string | null;
  recipient: {
    email: string;
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    storeName?: string | null;
    storeUrl?: string | null;
    customFields?: Record<string, unknown> | null;
  };
  campaignId?: string | undefined;
  campaignRecipientId?: string | undefined;
  /** Overrides for link generation, primarily for tests. */
  urls?: {
    appUrl?: string;
    apiUrl?: string;
  };
  secret?: string;
}

export interface ComposedEmail {
  subject: string;
  html: string;
  text: string;
  unsubscribeToken: string;
  /** Human-facing page, embedded in the body. */
  unsubscribeUrl: string;
  /** RFC 8058 one-click target, used in the List-Unsubscribe header. */
  oneClickUrl: string;
  missingVariables: string[];
}

/**
 * Flattens a recipient into the variable namespace. Standard columns win over
 * custom ones so a stray `email` column in a CSV cannot redirect a message.
 */
export function buildVariables(recipient: ComposeInput['recipient']): RecipientVariables {
  const custom: RecipientVariables = {};
  for (const [key, value] of Object.entries(recipient.customFields ?? {})) {
    if (value === null || value === undefined) continue;
    custom[key] = typeof value === 'object' ? JSON.stringify(value) : (value as string);
  }

  const first = recipient.firstName ?? recipient.name?.split(/\s+/)[0] ?? null;

  return {
    ...custom,
    email: recipient.email,
    name: recipient.name ?? ([recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || null),
    first_name: first,
    last_name: recipient.lastName ?? null,
    company: recipient.company ?? null,
    store_name: recipient.storeName ?? null,
    store_url: recipient.storeUrl ?? null,
  };
}

const UNSUBSCRIBE_PLACEHOLDER = /\{\{\s*unsubscribe_url\s*\}\}/gi;

/**
 * Compliance footer appended when the author's HTML has no unsubscribe link of
 * its own. Every marketing message must carry a visible opt-out, so this is a
 * backstop rather than an option.
 */
function unsubscribeFooterHtml(url: string): string {
  return (
    `\n<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;` +
    `font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280;">` +
    `You are receiving this email because you opted in to updates from us. ` +
    `<a href="${url}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>.` +
    `</div>\n`
  );
}

function unsubscribeFooterText(url: string): string {
  return `\n\n---\nYou are receiving this email because you opted in to updates from us.\nUnsubscribe: ${url}\n`;
}

export function composeEmail(input: ComposeInput): ComposedEmail {
  const variables = buildVariables(input.recipient);
  const missing = new Set<string>();

  const token = createUnsubscribeToken(
    {
      e: input.recipient.email,
      ...(input.campaignId ? { c: input.campaignId } : {}),
      ...(input.campaignRecipientId ? { r: input.campaignRecipientId } : {}),
    },
    input.secret,
  );

  const humanUrl = unsubscribeUrl(token, input.urls?.appUrl);
  const oneClickUrl = oneClickUnsubscribeUrl(token, input.urls?.apiUrl);

  const context: RecipientVariables = { ...variables, unsubscribe_url: humanUrl };

  const subject = renderTemplate(input.subject, context, {
    onMissing: (name) => missing.add(name),
  }).trim();

  let html = renderTemplate(input.htmlContent, context, {
    escapeHtml: true,
    onMissing: (name) => missing.add(name),
  });

  const authorProvidedText = input.textContent?.trim();
  let text = authorProvidedText
    ? renderTemplate(authorProvidedText, context, { onMissing: (name) => missing.add(name) })
    : htmlToPlainText(html);

  // `unsubscribe_url` is substituted above; if the template never referenced it
  // and contains no link to our unsubscribe route, append the footer.
  const hasLink = UNSUBSCRIBE_PLACEHOLDER.test(input.htmlContent) || html.includes(token);
  UNSUBSCRIBE_PLACEHOLDER.lastIndex = 0;

  if (!hasLink) {
    html = injectBeforeBodyClose(html, unsubscribeFooterHtml(humanUrl));
    text += unsubscribeFooterText(humanUrl);
  }

  return {
    subject,
    html,
    text,
    unsubscribeToken: token,
    unsubscribeUrl: humanUrl,
    oneClickUrl,
    missingVariables: [...missing].sort(),
  };
}

function injectBeforeBodyClose(html: string, fragment: string): string {
  const index = html.toLowerCase().lastIndexOf('</body>');
  if (index === -1) return html + fragment;
  return html.slice(0, index) + fragment + html.slice(index);
}
