import { parse } from 'csv-parse/sync';
import { AppError, isValidEmail, normalizeEmail, type ImportSummary } from '@mailstrive/shared';

/**
 * CSV parsing and validation.
 *
 * Kept free of database and filesystem access so the rules below are directly
 * unit-testable -- these are the rules that decide what ends up in a mailbox.
 */

/** Header aliases accepted for each first-class recipient column. */
const COLUMN_ALIASES: Record<string, string[]> = {
  // Aliases are written in canonical form: lower case, separators as underscores.
  email: ['email', 'e_mail', 'email_address', 'emailaddress', 'mail', 'merchant_email'],
  name: ['name', 'full_name', 'fullname', 'contact_name', 'merchant_name'],
  firstName: ['first_name', 'firstname', 'fname', 'given_name'],
  lastName: ['last_name', 'lastname', 'lname', 'surname', 'family_name'],
  company: [
    'company',
    'company_name',
    'business',
    'business_name',
    'organisation',
    'organization',
    'merchant',
    'merchant_business',
  ],
  storeName: ['store_name', 'storename', 'shop_name', 'shopname', 'store', 'shop'],
  storeUrl: ['store_url', 'storeurl', 'shop_url', 'website', 'url', 'site'],
};

export const CORE_FIELDS = [
  'email',
  'name',
  'firstName',
  'lastName',
  'company',
  'storeName',
  'storeUrl',
] as const;

export type CoreField = (typeof CORE_FIELDS)[number];

/**
 * A file has to say who its rows are for, not just where to send.
 *
 * This is checked per FILE, not per row: a CSV with no name and no merchant
 * column anywhere cannot personalise anything, and that is worth refusing. An
 * individual row missing its label is not -- the address is the thing being
 * imported, and a blank name renders as a blank, which the template's own
 * `{{name | fallback}}` default handles.
 *
 * So "invalid" means one thing only: the row has no usable email address.
 */
export const NAME_FIELDS = ['name', 'firstName', 'lastName'] as const;
export const MERCHANT_FIELDS = ['company', 'storeName'] as const;
export const IDENTITY_FIELDS: readonly CoreField[] = [...NAME_FIELDS, ...MERCHANT_FIELDS];

/** What a single CSV column becomes: a first-class field, a `{{variable}}`, or nothing. */
export type ColumnTarget = CoreField | 'custom' | 'ignore';

export interface ColumnMapping {
  /** Position of the column in the header row, as the uploader saw it. */
  index: number;
  /** The header text the uploader saw, used to detect a file that has changed. */
  header?: string | undefined;
  target: ColumnTarget;
  /** Placeholder name when `target` is `custom`; defaults to the header. */
  key?: string | undefined;
}

/** The placeholder each first-class field is addressed by in a template. */
const CORE_PLACEHOLDERS: Record<CoreField, string> = {
  email: 'email',
  name: 'name',
  firstName: 'first_name',
  lastName: 'last_name',
  company: 'company',
  storeName: 'store_name',
  storeUrl: 'store_url',
};

/**
 * Turns arbitrary header text into something usable as `{{a_variable}}`.
 *
 * Returns an empty string when nothing survives, so the caller can fall back to
 * a positional name rather than producing an unaddressable column.
 */
export function toVariableKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

const MAX_ERROR_SAMPLES = 100;
const MAX_ROWS = 1_000_000;
const MAX_FIELD_LENGTH = 2_000;

export interface ParsedRecipient {
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  storeName: string | null;
  storeUrl: string | null;
  customFields: Record<string, string>;
  rowNumber: number;
}

export interface ParseCsvResult {
  recipients: ParsedRecipient[];
  summary: Omit<ImportSummary, 'importedRecipients' | 'suppressedRecipients'>;
}

function canonicalHeader(header: string): string {
  return header.trim().toLowerCase().replace(/^\uFEFF/, '').replace(/[\s-]+/g, '_');
}

/**
 * Resolves a caller-supplied mapping onto the header row actually parsed here.
 *
 * The uploader chose targets against the header row their browser read, so the
 * indexes are trusted only when the header text still agrees. If the file was
 * swapped between choosing and uploading, the entry is re-matched by header
 * name and dropped if that fails -- better to fall back to auto-detection than
 * to write one column's values into another column's field.
 */
function resolveOverrides(
  headers: string[],
  columnMap: ColumnMapping[],
): Map<number, ColumnMapping> {
  const resolved = new Map<number, ColumnMapping>();

  for (const entry of columnMap) {
    let index = entry.index;
    const expected = entry.header === undefined ? undefined : canonicalHeader(entry.header);

    if (expected !== undefined && canonicalHeader(headers[index] ?? '') !== expected) {
      index = headers.findIndex((header) => canonicalHeader(header) === expected);
      if (index === -1) continue;
    }

    if (index < 0 || index >= headers.length || resolved.has(index)) continue;
    resolved.set(index, entry);
  }

  return resolved;
}

/** Auto-detects the field a header refers to, or null when it is not a known one. */
function detectField(canonical: string, claimed: Set<string>): CoreField | null {
  const match = Object.entries(COLUMN_ALIASES).find(
    ([name, aliases]) => !claimed.has(name) && aliases.includes(canonical),
  );
  return (match?.[0] as CoreField | undefined) ?? null;
}

/**
 * Maps raw CSV headers onto recipient fields.
 *
 * Columns the caller did not mention fall back to auto-detection, so a partial
 * mapping (say, only pointing `email` at the right column) still works.
 */
function buildHeaderMap(
  headers: string[],
  columnMap?: ColumnMapping[] | undefined,
): {
  mapping: Map<number, CoreField>;
  custom: Map<number, string>;
  emailIndex: number;
  /** The `{{placeholders}}` this file will expose, in column order. */
  columns: string[];
  /** Core fields this file actually supplies, for the identity check. */
  claimedFields: Set<string>;
} {
  const overrides: Map<number, ColumnMapping> = columnMap?.length
    ? resolveOverrides(headers, columnMap)
    : new Map();
  const mapping = new Map<number, CoreField>();
  const custom = new Map<number, string>();
  const claimed = new Set<string>();
  let emailIndex = -1;

  // Reserved so a custom column can never shadow a first-class field or the
  // unsubscribe link that every message carries.
  const usedKeys = new Set<string>(['unsubscribe_url']);

  const claimCore = (index: number, field: CoreField) => {
    claimed.add(field);
    mapping.set(index, field);
    usedKeys.add(CORE_PLACEHOLDERS[field]);
    if (field === 'email') emailIndex = index;
  };

  // First pass: honour explicit mappings, so an auto-detected column can never
  // take a field the uploader assigned somewhere else.
  headers.forEach((_rawHeader, index) => {
    const override = overrides.get(index);
    if (!override || override.target === 'ignore' || override.target === 'custom') return;

    if (claimed.has(override.target)) {
      throw AppError.badRequest(
        `Two columns are both mapped to "${override.target}". Each field can come from one column.`,
      );
    }
    claimCore(index, override.target);
  });

  // Second pass: auto-detect anything unmapped, then assign custom variables.
  headers.forEach((rawHeader, index) => {
    if (mapping.has(index)) return;

    const override = overrides.get(index);
    if (override?.target === 'ignore') return;

    const canonical = canonicalHeader(rawHeader);

    if (!override) {
      if (!canonical) return;
      const detected = detectField(canonical, claimed);
      if (detected) {
        claimCore(index, detected);
        return;
      }
    }

    // Everything else is preserved verbatim so it stays usable as a
    // {{variable}} in a template.
    const requested = override?.key ? toVariableKey(override.key) : toVariableKey(canonical);
    let key = requested || `column_${index + 1}`;
    for (let suffix = 2; usedKeys.has(key); suffix += 1) {
      key = `${requested || `column_${index + 1}`}_${suffix}`;
    }
    usedKeys.add(key);
    custom.set(index, key);
  });

  const columns: string[] = [];
  headers.forEach((_header, index) => {
    const field = mapping.get(index);
    if (field) {
      columns.push(CORE_PLACEHOLDERS[field]);
      return;
    }
    const key = custom.get(index);
    if (key) columns.push(key);
  });

  return { mapping, custom, emailIndex, columns, claimedFields: claimed };
}

function clean(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim().slice(0, MAX_FIELD_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

export interface ParseCsvOptions {
  /** Explicit column targets chosen by the uploader; unmapped columns auto-detect. */
  columnMap?: ColumnMapping[] | undefined;
}

export function parseRecipientCsv(
  content: Buffer | string,
  options: ParseCsvOptions = {},
): ParseCsvResult {
  const text = (Buffer.isBuffer(content) ? content.toString('utf8') : content).replace(/^\uFEFF/, '');

  if (text.trim().length === 0) {
    throw AppError.badRequest('The uploaded file is empty');
  }

  let rows: string[][];
  try {
    rows = parse(text, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: false,
      columns: false,
    }) as string[][];
  } catch (error) {
    throw AppError.badRequest(
      `Could not parse the CSV file: ${(error as Error).message}`,
    );
  }

  const headerRow = rows[0];
  if (!headerRow || headerRow.length === 0) {
    throw AppError.badRequest('The CSV file has no header row');
  }
  if (rows.length - 1 > MAX_ROWS) {
    throw AppError.badRequest(`The CSV file exceeds the ${MAX_ROWS.toLocaleString()} row limit`);
  }

  const { mapping, custom, emailIndex, columns, claimedFields } = buildHeaderMap(
    headerRow,
    options.columnMap,
  );
  const found = headerRow.map((header) => header.trim()).join(', ');

  if (emailIndex === -1) {
    throw AppError.badRequest(
      `The CSV must contain an "email" column. Found: ${found}. ` +
        'Pick the email column manually if it is named something else.',
    );
  }

  // Checked here rather than per row: a file with no identity column at all
  // would otherwise reject every row one at a time and report nothing useful.
  if (!IDENTITY_FIELDS.some((field) => claimedFields.has(field))) {
    throw AppError.badRequest(
      'The CSV must also contain a name or a merchant column, so messages can address ' +
        `the recipient. Found: ${found}. Map one of the columns to Name or Merchant if it is ` +
        'named something else.',
    );
  }
  const recipients: ParsedRecipient[] = [];
  const errors: ImportSummary['errors'] = [];
  const seen = new Set<string>();

  let invalidCount = 0;
  let duplicateCount = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;

    // Spreadsheet-style row number, so the user can find the offending line.
    const rowNumber = index + 1;
    const rawEmail = row[emailIndex];

    if (!rawEmail || rawEmail.trim().length === 0) {
      invalidCount += 1;
      if (errors.length < MAX_ERROR_SAMPLES) {
        errors.push({ row: rowNumber, email: null, reason: 'Missing email address' });
      }
      continue;
    }

    const email = normalizeEmail(rawEmail);

    if (!isValidEmail(email)) {
      invalidCount += 1;
      if (errors.length < MAX_ERROR_SAMPLES) {
        errors.push({ row: rowNumber, email, reason: 'Invalid email address' });
      }
      continue;
    }

    if (seen.has(email)) {
      duplicateCount += 1;
      if (errors.length < MAX_ERROR_SAMPLES) {
        errors.push({ row: rowNumber, email, reason: 'Duplicate of an earlier row' });
      }
      continue;
    }
    seen.add(email);

    const recipient: ParsedRecipient = {
      email,
      name: null,
      firstName: null,
      lastName: null,
      company: null,
      storeName: null,
      storeUrl: null,
      customFields: {},
      rowNumber,
    };

    for (const [columnIndex, field] of mapping) {
      if (field === 'email') continue;
      const value = clean(row[columnIndex]);
      if (value !== null) {
        (recipient as unknown as Record<string, string | null>)[field] = value;
      }
    }

    for (const [columnIndex, field] of custom) {
      const value = clean(row[columnIndex]);
      if (value !== null) recipient.customFields[field] = value;
    }

    // Fill `name` from the parts, and vice versa, so templates using either
    // form render for every row.
    if (!recipient.name && (recipient.firstName || recipient.lastName)) {
      recipient.name = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ');
    }
    if (!recipient.firstName && recipient.name) {
      recipient.firstName = recipient.name.split(/\s+/)[0] ?? null;
    }

    recipients.push(recipient);
  }

  return {
    recipients,
    summary: {
      totalRows: Math.max(0, rows.length - 1),
      validRecipients: recipients.length,
      invalidRecipients: invalidCount,
      duplicateRecipients: duplicateCount,
      columns,
      errors,
    },
  };
}
