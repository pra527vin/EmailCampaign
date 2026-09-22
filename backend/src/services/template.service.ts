import sanitizeHtml from 'sanitize-html';
import {
  AppError,
  extractVariables,
  htmlToPlainText,
  plainTextToHtml,
  prisma,
  type Paginated,
  type TemplateStatus,
} from '@mailstrive/shared';
import { recordAudit } from './audit.service.js';

/**
 * Preview sanitisation.
 *
 * This is applied ONLY to HTML rendered inside the dashboard, where it would
 * otherwise execute in the operator's session. The stored `htmlContent` is
 * never rewritten: real email HTML relies on tags and inline styles that a
 * browser-focused sanitiser would strip, and mangling it would make the preview
 * a lie. Mail clients do their own far stricter sanitisation on delivery.
 *
 * Anything dropped here shows up as a preview that disagrees with the message
 * that gets sent, which is worse than useless -- so the allowlist has to cover
 * everything the composer and a hand-written template actually emit. Static
 * SVG shapes are in because the composer draws social icons with them;
 * `script`, `foreignObject`, `use`, `animate` and every `on*` handler stay out,
 * and the dashboard renders the result in an empty-sandbox iframe regardless.
 */
/** Lower-cased for the same reason as the attributes below. */
const SVG_TAGS = [
  'svg', 'g', 'defs', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'rect', 'title', 'desc', 'lineargradient', 'radialgradient', 'stop',
];

/**
 * Lower-cased throughout, because the parser behind the sanitiser lower-cases
 * every attribute name before it is matched. Listing `viewBox` as written
 * silently drops it, and an icon with no viewBox renders as a crop of itself.
 * Browsers put the camel case back when they re-parse the SVG.
 */
const SVG_ATTRIBUTES = [
  'viewbox', 'xmlns', 'fill', 'fill-rule', 'fill-opacity', 'clip-rule', 'stroke',
  'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
  'stroke-opacity', 'opacity', 'd', 'points', 'transform', 'preserveaspectratio',
  'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'offset', 'stop-color',
  'stop-opacity', 'gradientunits', 'gradienttransform',
];

const PREVIEW_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img', 'style', 'link', 'center', 'font', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
    'body', 'head', 'html', 'meta', 'title', 'span', 'div', 'a', 'v:roundrect', 'o:p',
    ...SVG_TAGS,
  ],
  allowedAttributes: {
    '*': [
      'style', 'class', 'id', 'align', 'valign', 'width', 'height', 'bgcolor',
      'cellpadding', 'cellspacing', 'border', 'dir', 'lang', 'colspan', 'rowspan', 'role',
      ...SVG_ATTRIBUTES,
    ],
    a: ['href', 'target', 'rel', 'title', 'style', 'class'],
    // `referrerpolicy` travels with every image the composer builds, and hosts
    // that refuse a hotlinked Referer serve the picture only when it survives.
    img: ['src', 'alt', 'width', 'height', 'style', 'class', 'title', 'referrerpolicy'],
    meta: ['charset', 'name', 'content', 'http-equiv'],
    // Web fonts are pulled in with a stylesheet link as well as an @import,
    // because between them they cover most clients. Dropping the link would
    // preview a template in a fallback face it will not be delivered in.
    link: ['rel', 'href', 'type', 'media'],
  },
  // http(s), mailto and data: images only. This is what blocks javascript: URLs.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  allowedStyles: {},
  // Keep <style> blocks (email designs depend on them) but drop scripts.
  allowVulnerableTags: false,
};

export function sanitizeForPreview(html: string): string {
  return sanitizeHtml(html, PREVIEW_SANITIZE_OPTIONS);
}

export interface TemplateInput {
  name: string;
  description?: string | undefined;
  subject: string;
  htmlContent?: string | undefined;
  textContent?: string | undefined;
  status?: TemplateStatus | undefined;
}

type Context = { ipAddress?: string | undefined; userAgent?: string | undefined };

/**
 * Fills in whichever body the author did not write.
 *
 * Every message ships multipart/alternative with both parts -- a message with
 * only one is a known spam signal -- so exactly one of these two branches runs
 * depending on which body was authored. Deriving here rather than in the
 * browser keeps one implementation and means the stored HTML cannot be
 * whatever a client chose to send for a text-only template.
 */
function derive(input: TemplateInput) {
  const authoredHtml = input.htmlContent?.trim() ?? '';
  const authoredText = input.textContent?.trim() ?? '';

  // Also enforced by the request schema, but repeated here because the service
  // is reachable from the worker, the seed and the duplicate path as well as
  // from a route. Without it, two empty bodies would generate an empty wrapper
  // and store a template that sends a blank message.
  if (authoredHtml.length === 0 && authoredText.length === 0) {
    throw AppError.badRequest('Write an HTML body or a plain-text body');
  }

  const htmlContent = authoredHtml.length > 0 ? input.htmlContent! : plainTextToHtml(authoredText);
  const textContent = authoredText.length > 0 ? input.textContent! : htmlToPlainText(htmlContent);

  return {
    htmlContent,
    textContent,
    variables: extractVariables(input.subject, htmlContent, textContent).filter(
      (name) => name !== 'unsubscribe_url',
    ),
  };
}

export async function createTemplate(userId: string, input: TemplateInput, context: Context) {
  const { htmlContent, textContent, variables } = derive(input);

  const existing = await prisma.emailTemplate.findFirst({
    where: { userId, name: input.name },
    select: { id: true },
  });
  if (existing) throw AppError.conflict(`A template named "${input.name}" already exists`);

  const template = await prisma.emailTemplate.create({
    data: {
      userId,
      name: input.name,
      description: input.description ?? null,
      subject: input.subject,
      // The derived value, not the input: for a text-authored template the
      // input has no HTML at all.
      htmlContent,
      textContent,
      status: input.status ?? 'DRAFT',
      variables,
    },
  });

  await recordAudit({
    action: 'template.created',
    userId,
    entityType: 'email_template',
    entityId: template.id,
    metadata: { name: template.name },
    ...context,
  });

  return template;
}

export async function listTemplates(params: {
  userId: string;
  status?: TemplateStatus | undefined;
  search?: string | undefined;
  page: number;
  pageSize: number;
}): Promise<Paginated<Record<string, unknown>>> {
  const where = {
    userId: params.userId,
    ...(params.status ? { status: params.status } : {}),
    ...(params.search
      ? { name: { contains: params.search, mode: 'insensitive' as const } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.emailTemplate.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      // The body is excluded from list responses; it can be megabytes per row.
      select: {
        id: true,
        name: true,
        description: true,
        subject: true,
        status: true,
        variables: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { campaigns: true } },
      },
    }),
    prisma.emailTemplate.count({ where }),
  ]);

  return {
    items: items.map((item) => ({ ...item, campaignCount: item._count.campaigns, _count: undefined })),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

export async function getTemplate(userId: string, templateId: string) {
  const template = await prisma.emailTemplate.findFirst({
    where: { id: templateId, userId },
  });
  if (!template) throw AppError.notFound('Template');
  return template;
}

export async function updateTemplate(
  userId: string,
  templateId: string,
  input: Partial<TemplateInput>,
  context: Context,
) {
  const existing = await getTemplate(userId, templateId);

  if (input.name && input.name !== existing.name) {
    const clash = await prisma.emailTemplate.findFirst({
      where: { userId, name: input.name, NOT: { id: templateId } },
      select: { id: true },
    });
    if (clash) throw AppError.conflict(`A template named "${input.name}" already exists`);
  }

  // `undefined` means "leave alone"; an empty string means "clear it", which
  // is stored as NULL rather than an empty string so the column has one
  // representation of "no description".
  const description =
    input.description === undefined ? existing.description : input.description.trim() || null;

  // An explicit empty string on either body means "regenerate that one from the
  // other", which is how switching a saved template between HTML and plain text
  // replaces the stale half rather than leaving it behind.
  const authoredHtml = input.htmlContent ?? existing.htmlContent;
  const authoredText =
    input.textContent ?? (input.htmlContent === undefined ? existing.textContent : '');

  const merged: TemplateInput = {
    name: input.name ?? existing.name,
    description: description ?? undefined,
    subject: input.subject ?? existing.subject,
    htmlContent: authoredHtml,
    textContent: authoredText,
    status: input.status ?? existing.status,
  };

  const { htmlContent, textContent, variables } = derive(merged);

  const template = await prisma.emailTemplate.update({
    where: { id: templateId },
    data: {
      name: merged.name,
      description,
      subject: merged.subject,
      htmlContent,
      textContent,
      status: merged.status ?? 'DRAFT',
      variables,
    },
  });

  await recordAudit({
    action: 'template.updated',
    userId,
    entityType: 'email_template',
    entityId: templateId,
    metadata: { name: template.name, status: template.status },
    ...context,
  });

  return template;
}

export async function duplicateTemplate(userId: string, templateId: string, context: Context) {
  const source = await getTemplate(userId, templateId);

  // Find a free "(copy N)" name rather than failing on the unique constraint.
  let name = `${source.name} (copy)`;
  for (let attempt = 2; attempt < 50; attempt += 1) {
    const clash = await prisma.emailTemplate.findFirst({
      where: { userId, name },
      select: { id: true },
    });
    if (!clash) break;
    name = `${source.name} (copy ${attempt})`;
  }

  const copy = await prisma.emailTemplate.create({
    data: {
      userId,
      name,
      description: source.description,
      subject: source.subject,
      htmlContent: source.htmlContent,
      textContent: source.textContent,
      variables: source.variables,
      status: 'DRAFT',
    },
  });

  await recordAudit({
    action: 'template.duplicated',
    userId,
    entityType: 'email_template',
    entityId: copy.id,
    metadata: { sourceId: templateId, name },
    ...context,
  });

  return copy;
}

const ACTIVE_CAMPAIGN_STATUSES = ['QUEUED', 'SENDING', 'PAUSED'] as const;

export async function deleteTemplate(userId: string, templateId: string, context: Context) {
  await getTemplate(userId, templateId);

  const inUse = await prisma.campaign.count({
    where: { templateId, status: { in: [...ACTIVE_CAMPAIGN_STATUSES] } },
  });
  if (inUse > 0) {
    throw AppError.conflict('This template is in use by an active campaign and cannot be deleted');
  }

  const referenced = await prisma.campaign.count({ where: { templateId } });
  if (referenced > 0) {
    throw AppError.conflict(
      'This template is referenced by past campaigns. Deactivate it instead so campaign history stays intact.',
    );
  }

  await prisma.emailTemplate.delete({ where: { id: templateId } });
  await recordAudit({
    action: 'template.deleted',
    userId,
    entityType: 'email_template',
    entityId: templateId,
    ...context,
  });
}

export async function setTemplateStatus(
  userId: string,
  templateId: string,
  status: TemplateStatus,
  context: Context,
) {
  await getTemplate(userId, templateId);

  if (status !== 'ACTIVE') {
    const inUse = await prisma.campaign.count({
      where: { templateId, status: { in: [...ACTIVE_CAMPAIGN_STATUSES] } },
    });
    if (inUse > 0) {
      throw AppError.conflict('This template is in use by an active campaign and cannot be deactivated');
    }
  }

  const template = await prisma.emailTemplate.update({
    where: { id: templateId },
    data: { status },
  });

  await recordAudit({
    action: 'template.status_changed',
    userId,
    entityType: 'email_template',
    entityId: templateId,
    metadata: { status },
    ...context,
  });

  return template;
}
