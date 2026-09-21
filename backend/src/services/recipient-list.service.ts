import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  AppError,
  createLogger,
  isValidEmail,
  loadEnv,
  normalizeEmail,
  prisma,
  type ImportSummary,
  type Paginated,
} from '@mailstrive/shared';
import { parseRecipientCsv, toVariableKey, type ColumnMapping } from './csv.service.js';
import { filterSuppressed } from './suppression.service.js';
import { recordAudit } from './audit.service.js';

const log = createLogger('api:recipient-lists');

/** Rows per insert batch. Large enough to be fast, small enough to stay bounded. */
const INSERT_BATCH_SIZE = 1_000;

export interface ImportCsvParams {
  userId: string;
  name: string;
  description?: string | undefined;
  fileName: string;
  fileBuffer: Buffer;
  /** Drop rows already on the suppression list instead of importing them. */
  skipSuppressed?: boolean;
  /** Explicit header targets chosen in the upload form; unmapped columns auto-detect. */
  columnMap?: ColumnMapping[] | undefined;
  context: { ipAddress?: string | undefined; userAgent?: string | undefined };
}

export interface ImportCsvResult {
  listId: string;
  summary: ImportSummary;
}

/** Persists the original upload so an import can always be audited later. */
async function storeSourceFile(fileName: string, buffer: Buffer, hash: string): Promise<string | null> {
  const env = loadEnv();
  try {
    const directory = resolve(env.UPLOAD_DIR);
    await mkdir(directory, { recursive: true });
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const path = join(directory, `${Date.now()}-${hash.slice(0, 12)}-${safeName}`);
    await writeFile(path, buffer);
    return path;
  } catch (error) {
    // A failed archive write must not lose the import itself.
    log.warn({ err: error, fileName }, 'Could not archive uploaded CSV');
    return null;
  }
}

export async function importCsv(params: ImportCsvParams): Promise<ImportCsvResult> {
  const parsed = parseRecipientCsv(params.fileBuffer, { columnMap: params.columnMap });
  const hash = createHash('sha256').update(params.fileBuffer).digest('hex');

  const suppressed = params.skipSuppressed
    ? await filterSuppressed(parsed.recipients.map((recipient) => recipient.email))
    : new Set<string>();

  const importable = parsed.recipients.filter((recipient) => !suppressed.has(recipient.email));

  if (importable.length === 0) {
    throw AppError.unprocessable(
      'No importable recipients were found in this file',
      parsed.summary,
    );
  }

  const storedFilePath = await storeSourceFile(params.fileName, params.fileBuffer, hash);

  const list = await prisma.recipientList.create({
    data: {
      userId: params.userId,
      name: params.name,
      description: params.description ?? null,
      sourceFileName: params.fileName,
      sourceFileSize: params.fileBuffer.byteLength,
      sourceFileHash: hash,
      storedFilePath,
      status: 'PROCESSING',
      totalRows: parsed.summary.totalRows,
      validCount: parsed.summary.validRecipients,
      invalidCount: parsed.summary.invalidRecipients,
      duplicateCount: parsed.summary.duplicateRecipients,
      columns: parsed.summary.columns,
      errorSample: parsed.summary.errors as never,
    },
  });

  let imported = 0;
  try {
    for (let index = 0; index < importable.length; index += INSERT_BATCH_SIZE) {
      const batch = importable.slice(index, index + INSERT_BATCH_SIZE);
      const result = await prisma.recipient.createMany({
        data: batch.map((recipient) => ({
          listId: list.id,
          email: recipient.email,
          name: recipient.name,
          firstName: recipient.firstName,
          lastName: recipient.lastName,
          company: recipient.company,
          storeName: recipient.storeName,
          storeUrl: recipient.storeUrl,
          customFields: recipient.customFields as never,
          rowNumber: recipient.rowNumber,
        })),
        // The (list_id, email) unique index is the last line of defence against
        // duplicates that slipped past the in-memory `seen` set.
        skipDuplicates: true,
      });
      imported += result.count;
    }
  } catch (error) {
    await prisma.recipientList.update({
      where: { id: list.id },
      data: { status: 'FAILED' },
    });
    throw error;
  }

  await prisma.recipientList.update({
    where: { id: list.id },
    data: { status: 'READY', importedCount: imported },
  });

  const summary: ImportSummary = {
    ...parsed.summary,
    suppressedRecipients: suppressed.size,
    importedRecipients: imported,
  };

  await recordAudit({
    action: 'recipient_list.imported',
    userId: params.userId,
    entityType: 'recipient_list',
    entityId: list.id,
    metadata: {
      fileName: params.fileName,
      ...summary,
      errors: undefined,
    },
    ...params.context,
  });

  log.info({ listId: list.id, imported, total: summary.totalRows }, 'CSV import complete');

  return { listId: list.id, summary };
}

export async function listRecipientLists(params: {
  userId: string;
  search?: string | undefined;
  page: number;
  pageSize: number;
}): Promise<Paginated<Record<string, unknown>>> {
  const where = {
    userId: params.userId,
    ...(params.search
      ? { name: { contains: params.search, mode: 'insensitive' as const } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.recipientList.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { _count: { select: { recipients: true, campaigns: true } } },
    }),
    prisma.recipientList.count({ where }),
  ]);

  return {
    items: items.map((list) => ({
      ...list,
      errorSample: undefined,
      recipientCount: list._count.recipients,
      campaignCount: list._count.campaigns,
      _count: undefined,
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

export async function getRecipientList(userId: string, listId: string) {
  const list = await prisma.recipientList.findFirst({
    where: { id: listId, userId },
    include: { _count: { select: { recipients: true, campaigns: true } } },
  });
  if (!list) throw AppError.notFound('Recipient list');

  return {
    ...list,
    recipientCount: list._count.recipients,
    campaignCount: list._count.campaigns,
    _count: undefined,
  };
}

export async function listRecipients(params: {
  userId: string;
  listId: string;
  search?: string | undefined;
  page: number;
  pageSize: number;
}) {
  // Ownership check before any recipient data is read.
  await getRecipientList(params.userId, params.listId);

  const where = {
    listId: params.listId,
    ...(params.search
      ? {
          // Name, merchant and address -- the three things someone actually
          // remembers about a recipient they are trying to find.
          OR: [
            { email: { contains: params.search, mode: 'insensitive' as const } },
            { name: { contains: params.search, mode: 'insensitive' as const } },
            { firstName: { contains: params.search, mode: 'insensitive' as const } },
            { lastName: { contains: params.search, mode: 'insensitive' as const } },
            { company: { contains: params.search, mode: 'insensitive' as const } },
            { storeName: { contains: params.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.recipient.findMany({
      where,
      orderBy: { rowNumber: 'asc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.recipient.count({ where }),
  ]);

  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

export async function deleteRecipientList(
  userId: string,
  listId: string,
  context: { ipAddress?: string | undefined; userAgent?: string | undefined },
): Promise<void> {
  const list = await prisma.recipientList.findFirst({
    where: { id: listId, userId },
    include: { _count: { select: { campaigns: true } } },
  });
  if (!list) throw AppError.notFound('Recipient list');

  if (list._count.campaigns > 0) {
    throw AppError.conflict(
      'This list is used by one or more campaigns and cannot be deleted. Delete those campaigns first.',
    );
  }

  await prisma.recipientList.delete({ where: { id: listId } });
  await recordAudit({
    action: 'recipient_list.deleted',
    userId,
    entityType: 'recipient_list',
    entityId: listId,
    metadata: { name: list.name },
    ...context,
  });
}

/**
 * Rename a list or change its note.
 *
 * Only the labels are editable. The counts, columns and source-file details are
 * a record of what was actually imported, and letting those be edited would
 * make the import summary a claim rather than a fact.
 */
export async function updateRecipientList(params: {
  userId: string;
  listId: string;
  data: { name?: string; description?: string | null };
  context: { ipAddress?: string | undefined; userAgent?: string | undefined };
}) {
  const { userId, listId, data, context } = params;

  const list = await prisma.recipientList.findFirst({ where: { id: listId, userId } });
  if (!list) throw AppError.notFound('Recipient list');

  const changes: { name?: string; description?: string | null } = {};
  if (data.name !== undefined && data.name !== list.name) changes.name = data.name;
  if (data.description !== undefined && data.description !== list.description) {
    changes.description = data.description;
  }

  // Nothing actually changed, so no write and no audit entry -- an audit log
  // full of no-op edits is harder to read than one without them.
  if (Object.keys(changes).length === 0) return getRecipientList(userId, listId);

  await prisma.recipientList.update({ where: { id: listId }, data: changes });

  await recordAudit({
    action: 'recipient_list.updated',
    userId,
    entityType: 'recipient_list',
    entityId: listId,
    // The previous name is recorded so a rename can be traced back; the new one
    // is on the row itself.
    metadata: { fields: Object.keys(changes), previousName: list.name },
    ...context,
  });

  // Re-read through the shared getter so the response carries the same shape
  // the list and detail endpoints return, counts included.
  return getRecipientList(userId, listId);
}

// --- Editing a single recipient --------------------------------------------

/**
 * A campaign in one of these states has already snapshotted its recipients, so
 * editing the underlying row would silently disagree with what is being sent.
 */
const SENDING_STATUSES = ['QUEUED', 'SENDING', 'PAUSED'] as const;

/** Upper bounds mirroring the CSV importer, so edits cannot exceed an import. */
const MAX_CUSTOM_FIELDS = 50;
const MAX_FIELD_LENGTH = 2_000;

export interface RecipientUpdate {
  email?: string | undefined;
  name?: string | null | undefined;
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  company?: string | null | undefined;
  storeName?: string | null | undefined;
  storeUrl?: string | null | undefined;
  /** Replaces the whole custom-field map when present. */
  customFields?: Record<string, string> | undefined;
}

/** Trims to the stored limit; an empty string clears the column to NULL. */
function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim().slice(0, MAX_FIELD_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

export async function updateRecipient(params: {
  userId: string;
  listId: string;
  recipientId: string;
  data: RecipientUpdate;
  context: { ipAddress?: string | undefined; userAgent?: string | undefined };
}) {
  const list = await getRecipientList(params.userId, params.listId);

  const existing = await prisma.recipient.findFirst({
    where: { id: params.recipientId, listId: params.listId },
  });
  if (!existing) throw AppError.notFound('Recipient');

  const inFlight = await prisma.campaign.count({
    where: { listId: params.listId, status: { in: [...SENDING_STATUSES] } },
  });
  if (inFlight > 0) {
    throw AppError.conflict(
      'A campaign using this list is queued, sending or paused. Finish or cancel it before editing recipients.',
    );
  }

  let email = existing.email;
  if (params.data.email !== undefined) {
    email = normalizeEmail(params.data.email);
    if (!isValidEmail(email)) {
      // Shaped like a Zod issue so the form can show it against the field.
      throw AppError.badRequest('Enter a valid email address', [
        { path: 'email', message: 'Enter a valid email address' },
      ]);
    }
    if (email.toLowerCase() !== existing.email.toLowerCase()) {
      // The (list_id, email) unique index is case-insensitive (citext), so the
      // check and the constraint agree.
      const clash = await prisma.recipient.findFirst({
        where: { listId: params.listId, email, NOT: { id: params.recipientId } },
        select: { id: true },
      });
      if (clash) {
        throw AppError.conflict('Another recipient in this list already uses that email address');
      }
    }
  }

  // Custom-field keys go through the same sanitiser as CSV headers, so a value
  // typed here is addressable as {{a_variable}} exactly like an imported one.
  let customFields: Record<string, string> | undefined;
  if (params.data.customFields) {
    const entries = Object.entries(params.data.customFields).slice(0, MAX_CUSTOM_FIELDS);
    customFields = {};
    for (const [rawKey, rawValue] of entries) {
      const key = toVariableKey(rawKey);
      const value = String(rawValue ?? '').trim().slice(0, MAX_FIELD_LENGTH);
      if (!key || key === 'unsubscribe_url' || value.length === 0) continue;
      customFields[key] = value;
    }
  }

  // Only fields the caller actually sent are written; `undefined` means
  // "leave alone", an empty string means "clear it".
  const text: Record<string, string | null> = {};
  for (const field of ['name', 'firstName', 'lastName', 'company', 'storeName', 'storeUrl'] as const) {
    const value = optionalText(params.data[field]);
    if (value !== undefined) text[field] = value;
  }

  const recipient = await prisma.recipient.update({
    where: { id: params.recipientId },
    data: {
      email,
      ...text,
      ...(customFields ? { customFields: customFields as never } : {}),
    },
  });

  // A field invented while editing should show up in the list's column hints,
  // otherwise it is usable in a template but invisible in the UI.
  if (customFields) {
    const added = Object.keys(customFields).filter((key) => !list.columns.includes(key));
    if (added.length > 0) {
      await prisma.recipientList.update({
        where: { id: params.listId },
        data: { columns: [...list.columns, ...added] },
      });
    }
  }

  await recordAudit({
    action: 'recipient.updated',
    userId: params.userId,
    entityType: 'recipient',
    entityId: recipient.id,
    // The address itself is the subject of the change, so it is recorded; no
    // other recipient data is copied into the audit trail.
    metadata: {
      listId: params.listId,
      emailChanged: email.toLowerCase() !== existing.email.toLowerCase(),
    },
    ...params.context,
  });

  return recipient;
}
