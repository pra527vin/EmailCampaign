import {
  analyzeEmailHtml,
  AppError,
  buildMimeMessage,
  composeEmail,
  loadEnv,
  plainTextToHtml,
  prisma,
  type EmailHtmlWarning,
} from '@mailstrive/shared';
import { sanitizeForPreview } from './template.service.js';

/**
 * Preview generation.
 *
 * Runs the exact `composeEmail` pipeline the worker uses, then sanitises only
 * the copy that gets injected into the dashboard iframe. `rawHeaders` is built
 * from the unsanitised body so the operator sees the real message envelope.
 */

export interface PreviewResult {
  subject: string;
  from: string;
  to: string;
  replyTo: string | null;
  /** Sanitised for rendering in the dashboard. */
  html: string;
  /** Plain-text alternative exactly as it will be sent. */
  text: string;
  unsubscribeUrl: string;
  missingVariables: string[];
  /** Header block of the real MIME message, for the confirmation screen. */
  rawHeaders: string;
  sampleSource: 'recipient' | 'sample';
  /** Deliverability problems detected in the template source. */
  warnings: EmailHtmlWarning[];
}

const FALLBACK_SAMPLE = {
  email: 'merchant@example.com',
  name: 'Jane Merchant',
  firstName: 'Jane',
  lastName: 'Merchant',
  company: 'Example Ltd',
  storeName: 'Example Store',
  storeUrl: 'https://example-store.test',
  customFields: { plan: 'Pro', city: 'Berlin' } as Record<string, unknown>,
};

export interface PreviewParams {
  userId: string;
  templateId?: string | undefined;
  /** Ad-hoc body, used by the template editor before the template is saved. */
  htmlContent?: string | undefined;
  textContent?: string | undefined;
  subject?: string | undefined;
  listId?: string | undefined;
  recipientId?: string | undefined;
  campaignId?: string | undefined;
}

export async function buildPreview(params: PreviewParams): Promise<PreviewResult> {
  const env = loadEnv();

  let subject = params.subject;
  let htmlContent = params.htmlContent;
  let textContent = params.textContent;
  let fromName = env.SES_FROM_NAME;
  let replyTo = env.SES_REPLY_TO_EMAIL ?? null;

  if (params.campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: params.campaignId, userId: params.userId },
      include: { template: true },
    });
    if (!campaign) throw AppError.notFound('Campaign');
    subject ??= campaign.subject;
    htmlContent ??= campaign.template.htmlContent;
    textContent ??= campaign.template.textContent;
    fromName = campaign.fromName ?? fromName;
    replyTo = campaign.replyToEmail ?? replyTo;
  } else if (params.templateId) {
    const template = await prisma.emailTemplate.findFirst({
      where: { id: params.templateId, userId: params.userId },
    });
    if (!template) throw AppError.notFound('Template');
    subject ??= template.subject;
    htmlContent ??= template.htmlContent;
    textContent ??= template.textContent;
  }

  // A body authored as plain text has no HTML yet. `createTemplate` generates
  // it with the same call, so previewing shows the message that would actually
  // be stored and sent rather than refusing a body the editor considers done.
  if (!htmlContent && textContent) {
    htmlContent = plainTextToHtml(textContent);
  }

  if (!htmlContent) {
    throw AppError.badRequest(
      'Provide a template id, a campaign id, or a body to preview',
    );
  }

  // Prefer a real row from the list so the operator sees genuine data.
  let sample = FALLBACK_SAMPLE;
  let sampleSource: PreviewResult['sampleSource'] = 'sample';

  const listId =
    params.listId ??
    (params.campaignId
      ? (await prisma.campaign.findUnique({
          where: { id: params.campaignId },
          select: { listId: true },
        }))?.listId
      : undefined);

  if (params.recipientId || listId) {
    const recipient = await prisma.recipient.findFirst({
      where: params.recipientId
        ? { id: params.recipientId, list: { userId: params.userId } }
        : { listId, list: { userId: params.userId } },
      orderBy: { rowNumber: 'asc' },
    });
    if (recipient) {
      sample = {
        email: recipient.email,
        name: recipient.name ?? '',
        firstName: recipient.firstName ?? '',
        lastName: recipient.lastName ?? '',
        company: recipient.company ?? '',
        storeName: recipient.storeName ?? '',
        storeUrl: recipient.storeUrl ?? '',
        customFields: (recipient.customFields as Record<string, unknown>) ?? {},
      };
      sampleSource = 'recipient';
    }
  }

  const composed = composeEmail({
    subject: subject ?? '(no subject)',
    htmlContent,
    textContent: textContent ?? null,
    recipient: sample,
    ...(params.campaignId ? { campaignId: params.campaignId } : {}),
  });

  const from = { email: env.SES_FROM_EMAIL, name: fromName };
  const { raw } = buildMimeMessage({
    from,
    to: { email: sample.email, name: sample.name || undefined },
    replyTo: replyTo ?? undefined,
    subject: composed.subject,
    html: composed.html,
    text: composed.text,
    listUnsubscribeUrl: composed.oneClickUrl,
    listUnsubscribeMailto: replyTo ?? undefined,
    ...(params.campaignId ? { extraHeaders: { 'X-Campaign-ID': params.campaignId } } : {}),
  });

  return {
    subject: composed.subject,
    from: fromName ? `${fromName} <${env.SES_FROM_EMAIL}>` : env.SES_FROM_EMAIL,
    to: sample.email,
    replyTo,
    html: sanitizeForPreview(composed.html),
    text: composed.text,
    unsubscribeUrl: composed.unsubscribeUrl,
    missingVariables: composed.missingVariables,
    rawHeaders: raw.split('\r\n\r\n')[0] ?? '',
    sampleSource,
    // Analyse the author's source, not the rendered copy, so the advice points
    // at something they can actually edit.
    warnings: analyzeEmailHtml(htmlContent),
  };
}
