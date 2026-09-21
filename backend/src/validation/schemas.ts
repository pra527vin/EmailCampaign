import { z } from 'zod';

/** Shared primitives so every endpoint validates ids and paging identically. */
export const uuidParam = z.string().uuid('Must be a valid identifier');

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().min(1).max(200).optional(),
});

export const idParams = z.object({ id: uuidParam });

const password = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(200, 'Password must be at most 200 characters')
  // Length does most of the work; this rules out single-class passwords.
  .refine(
    (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value),
    'Password must contain lower case, upper case and a digit',
  );

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password: z.string().min(1, 'Password is required').max(200),
});

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

export const createUserBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(120),
  password,
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

export const updateUserBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['ADMIN', 'MEMBER']).optional(),
  isActive: z.boolean().optional(),
});

// --- Recipient lists --------------------------------------------------------

const coreField = z.enum([
  'email', 'name', 'firstName', 'lastName', 'company', 'storeName', 'storeUrl',
]);

/** One CSV column's destination, as chosen in the upload form. */
const columnMapping = z.object({
  index: z.coerce.number().int().min(0).max(999),
  header: z.string().max(300).optional(),
  target: z.union([coreField, z.literal('custom'), z.literal('ignore')]),
  // Free text; the importer sanitises it into a usable {{variable}} name.
  key: z.string().trim().max(60).optional(),
});

export const uploadListBody = z.object({
  name: z.string().trim().min(1, 'Give the list a name').max(150),
  description: z.string().trim().max(1_000).optional(),
  // multipart/form-data delivers everything as a string.
  skipSuppressed: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .default(true)
    .transform((value) => value === true || value === 'true'),
  /**
   * Column mapping, sent as a JSON string because the rest of the upload is
   * multipart. Parsed here so the route never sees raw JSON text.
   */
  columnMap: z
    .string()
    .max(100_000)
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined;
      try {
        return z.array(columnMapping).max(500).parse(JSON.parse(value));
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Column mapping is not valid' });
        return z.NEVER;
      }
    }),
});

// --- Recipients -------------------------------------------------------------

export const recipientParams = z.object({ id: uuidParam, recipientId: uuidParam });

/** An empty string clears a column; omitting the key leaves it untouched. */
const recipientText = z.string().trim().max(2_000).optional();

export const updateRecipientBody = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254).optional(),
  name: recipientText,
  firstName: recipientText,
  lastName: recipientText,
  company: recipientText,
  storeName: recipientText,
  storeUrl: recipientText,
  customFields: z.record(z.string().max(60), z.string().max(2_000)).optional(),
});

// --- Templates --------------------------------------------------------------

const templateStatus = z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']);

/**
 * A template needs one body, not necessarily an HTML one.
 *
 * Authoring in plain text is a first-class choice, so `htmlContent` may be
 * omitted -- the service derives it, the same way it already derives the text
 * part from HTML. What is refused is a template with neither.
 */
export const createTemplateBody = z
  .object({
    name: z.string().trim().min(1, 'Give the template a name').max(150),
    description: z.string().trim().max(1_000).optional(),
    subject: z.string().trim().min(1, 'Subject is required').max(500),
    htmlContent: z.string().max(2_000_000).optional(),
    textContent: z.string().max(2_000_000).optional(),
    status: templateStatus.optional(),
  })
  .refine(
    (value) =>
      (value.htmlContent?.trim().length ?? 0) > 0 || (value.textContent?.trim().length ?? 0) > 0,
    { message: 'Write an HTML body or a plain-text body', path: ['htmlContent'] },
  );

export const updateTemplateBody = z.object({
  name: z.string().trim().min(1, 'Give the template a name').max(150).optional(),
  description: z.string().trim().max(1_000).optional(),
  subject: z.string().trim().min(1, 'Subject is required').max(500).optional(),
  htmlContent: z.string().max(2_000_000).optional(),
  textContent: z.string().max(2_000_000).optional(),
  status: templateStatus.optional(),
});

export const templateStatusBody = z.object({ status: templateStatus });

export const templateListQuery = paginationQuery.extend({
  status: templateStatus.optional(),
});

// --- Campaigns --------------------------------------------------------------

const campaignStatus = z.enum([
  'DRAFT', 'QUEUED', 'SENDING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED',
]);

const recipientStatus = z.enum([
  'PENDING', 'QUEUED', 'SENDING', 'SENT', 'FAILED', 'BOUNCED', 'COMPLAINT',
  'UNSUBSCRIBED', 'SKIPPED',
]);

export const createCampaignBody = z.object({
  name: z.string().trim().min(1, 'Give the campaign a name').max(150),
  listId: uuidParam,
  templateId: uuidParam,
  subject: z.string().trim().min(1, 'Subject is required').max(500),
  fromName: z.string().trim().max(150).optional(),
  replyToEmail: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal('')),
  sendRatePerSecond: z.coerce.number().int().min(1).max(1_000).optional(),
});

export const updateCampaignBody = createCampaignBody.partial();

export const campaignListQuery = paginationQuery.extend({
  status: campaignStatus.optional(),
  // Same shape as the dashboard filter, plus "all" -- a list defaults to
  // showing everything rather than to a window.
  preset: z.enum(['all', '7d', '30d', '90d', 'custom']).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be a date in YYYY-MM-DD form')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be a date in YYYY-MM-DD form')
    .optional(),
});

export const campaignRecipientsQuery = paginationQuery.extend({
  status: recipientStatus.optional(),
});

// --- Preview ----------------------------------------------------------------

export const previewBody = z
  .object({
    templateId: uuidParam.optional(),
    campaignId: uuidParam.optional(),
    listId: uuidParam.optional(),
    recipientId: uuidParam.optional(),
    subject: z.string().max(500).optional(),
    htmlContent: z.string().max(2_000_000).optional(),
    textContent: z.string().max(2_000_000).optional(),
  })
  .refine(
    // textContent counts: a template authored as plain text has no HTML until
    // the server generates it, and previewing it is exactly how the author
    // checks that generated half before saving.
    (value) =>
      Boolean(value.templateId ?? value.campaignId ?? value.htmlContent ?? value.textContent),
    'Provide templateId, campaignId, htmlContent or textContent',
  );

// --- Suppression ------------------------------------------------------------

export const suppressionBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  reason: z.enum(['UNSUBSCRIBE', 'BOUNCE', 'COMPLAINT', 'MANUAL']).default('MANUAL'),
  notes: z.string().trim().max(500).optional(),
});

export const suppressionListQuery = paginationQuery.extend({
  reason: z.enum(['UNSUBSCRIBE', 'BOUNCE', 'COMPLAINT', 'MANUAL']).optional(),
});

// --- Unsubscribe ------------------------------------------------------------

export const unsubscribeTokenParams = z.object({
  token: z.string().min(10).max(2_000),
});

export const unsubscribeBody = z
  .object({
    token: z.string().min(10).max(2_000).optional(),
    // RFC 8058 one-click bodies arrive as `List-Unsubscribe=One-Click`.
    'List-Unsubscribe': z.string().optional(),
  })
  .passthrough();

/**
 * Dashboard date filter.
 *
 * Deliberately permissive in shape and strict in meaning: the schema only
 * checks that the strings look like days, and `resolveDashboardRange` decides
 * whether the pair is a usable window. Keeping the real rules in one shared
 * function means the backend and the UI cannot drift on what "last 7 days"
 * covers.
 */
export const dashboardStatsQuery = z.object({
  preset: z.enum(['7d', '30d', '90d', 'custom']).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be a date in YYYY-MM-DD form')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be a date in YYYY-MM-DD form')
    .optional(),
});

/** Renaming an imported list. Counts and columns are not editable. */
export const updateRecipientListBody = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').max(150).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide a name or a description to change',
  });
