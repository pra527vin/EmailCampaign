/**
 * Reads a CSV in the browser so the uploader can check it before committing.
 *
 * This is a preview, not the import: the server re-parses the file with the
 * real parser and its result is authoritative. What this buys is the chance to
 * see every row, fix the column mapping, and find out that half the file has no
 * email address *before* 25 MB goes over the wire and lands in the database.
 *
 * The checks below therefore mirror the server's rules deliberately. If the two
 * ever disagree the server wins, and the import summary will say so.
 */

/**
 * The whole file is read so the uploader can see every row before committing,
 * but not without a ceiling: parsing and rendering an unbounded CSV in the
 * browser is how a tab freezes. Past this many rows the preview says so, and
 * the server still imports the file in full.
 */
export const PREVIEW_MAX_ROWS = 20_000;

export interface CsvPreview {
  headers: string[];
  /** Data rows, aligned to `headers` by position. */
  rows: string[][];
  /** True when the file has more rows than the preview ceiling. */
  truncated: boolean;
}

/**
 * Minimal RFC 4180 reader: quoted fields, doubled quotes, and CRLF or LF rows.
 * Anything stranger is the server parser's problem, not the preview's.
 */
function parseRows(text: string, maxRows: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ',') {
      endField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      endRow();
      if (rows.length >= maxRows) return rows;
    } else {
      field += char;
    }
  }

  // A row still in progress at the end of the slice is incomplete: drop it
  // unless it is the whole file, in which case it is a real final row.
  if (field.length > 0 || row.length > 0) endRow();
  return rows;
}

export async function readCsvPreview(file: File): Promise<CsvPreview> {
  const text = (await file.text()).replace(/^\uFEFF/, '');

  // +1 for the header row.
  const rows = parseRows(text, PREVIEW_MAX_ROWS + 1);
  const headers = rows.shift() ?? [];
  if (headers.length === 0 || headers.every((header) => header.trim().length === 0)) {
    throw new Error('That file does not start with a header row.');
  }

  return {
    headers: headers.map((header) => header.trim()),
    rows,
    truncated: rows.length >= PREVIEW_MAX_ROWS,
  };
}

// --- Suggesting a mapping ---------------------------------------------------

/** Mirrors the aliases the server uses, so the form opens on the same guess. */
const ALIASES: Record<string, string[]> = {
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

function canonical(header: string): string {
  return header.trim().toLowerCase().replace(/^\uFEFF/, '').replace(/[\s-]+/g, '_');
}

/** Sanitises a header into a usable `{{variable}}`, matching the server. */
export function toVariableKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export type ColumnTarget =
  | 'email'
  | 'name'
  | 'firstName'
  | 'lastName'
  | 'company'
  | 'storeName'
  | 'storeUrl'
  | 'custom'
  | 'ignore';

export interface ColumnChoice {
  index: number;
  header: string;
  target: ColumnTarget;
  /** Placeholder name, used when `target` is `custom`. */
  key: string;
}

/** The starting mapping: the same guess the importer would make unaided. */
export function suggestMapping(headers: string[]): ColumnChoice[] {
  const claimed = new Set<string>();

  return headers.map((header, index) => {
    const key = canonical(header);
    const match = Object.entries(ALIASES).find(
      ([field, aliases]) => !claimed.has(field) && aliases.includes(key),
    );

    if (match) {
      claimed.add(match[0]);
      return { index, header, target: match[0] as ColumnTarget, key: '' };
    }

    return { index, header, target: 'custom' as ColumnTarget, key: toVariableKey(header) };
  });
}

/** The `{{placeholder}}` a choice will produce, or null when it is ignored. */
export function placeholderFor(choice: ColumnChoice): string | null {
  const CORE: Record<string, string> = {
    email: 'email',
    name: 'name',
    firstName: 'first_name',
    lastName: 'last_name',
    company: 'company',
    storeName: 'store_name',
    storeUrl: 'store_url',
  };

  if (choice.target === 'ignore') return null;
  if (choice.target === 'custom') {
    return toVariableKey(choice.key) || `column_${choice.index + 1}`;
  }
  return CORE[choice.target] ?? null;
}

// --- Checking the rows against the same rules the importer applies ----------

/** Either side of this satisfies "a row must say who it is for". */
export const NAME_TARGETS: readonly ColumnTarget[] = ['name', 'firstName', 'lastName'];
export const MERCHANT_TARGETS: readonly ColumnTarget[] = ['company', 'storeName'];
export const IDENTITY_TARGETS: readonly ColumnTarget[] = [...NAME_TARGETS, ...MERCHANT_TARGETS];

/**
 * `no-identity` is NOT a rejection.
 *
 * A row is only unusable when it has no address to send to. A row with an
 * address but no name still imports -- it is flagged so the blank is visible
 * before it renders as one, and so the file's own `{{name | fallback}}` can be
 * set, but it is counted among the rows that will import.
 */
export type RowVerdict = 'ok' | 'no-identity' | 'no-email' | 'bad-email' | 'duplicate';

/** The verdicts that mean the row will not be imported. */
export const REJECTED_VERDICTS: readonly RowVerdict[] = ['no-email', 'bad-email', 'duplicate'];

export function willImport(verdict: RowVerdict): boolean {
  return !REJECTED_VERDICTS.includes(verdict);
}

export interface CheckedRow {
  /** Spreadsheet line number, so a problem row can be found in the file. */
  rowNumber: number;
  cells: string[];
  email: string;
  verdict: RowVerdict;
}

export interface RowCheck {
  rows: CheckedRow[];
  counts: Record<RowVerdict, number>;
}

export const VERDICT_LABEL: Record<RowVerdict, string> = {
  ok: 'Ready',
  'no-identity': 'No name',
  'no-email': 'No email',
  'bad-email': 'Invalid email',
  duplicate: 'Duplicate',
};

/**
 * A pragmatic address check, matching the importer's intent rather than RFC
 * 5322 in full: one @, something either side, a dot in the domain, no spaces.
 * Anything subtler is the server's call, and a false pass here costs nothing
 * because the server re-checks.
 */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

/**
 * Classifies every row under the current mapping.
 *
 * The first occurrence of an address wins and later ones are marked duplicate,
 * which is what the importer does -- so the count shown here is the number of
 * rows that will actually be dropped, not merely how many repeats exist.
 */
export function checkRows(rows: string[][], choices: ColumnChoice[]): RowCheck {
  const emailIndex = choices.find((choice) => choice.target === 'email')?.index ?? -1;
  const identityIndexes = choices
    .filter((choice) => IDENTITY_TARGETS.includes(choice.target))
    .map((choice) => choice.index);

  const seen = new Set<string>();
  const counts: Record<RowVerdict, number> = {
    ok: 0,
    'no-email': 0,
    'bad-email': 0,
    duplicate: 0,
    'no-identity': 0,
  };

  const checked = rows.map((cells, index) => {
    const raw = (emailIndex === -1 ? '' : (cells[emailIndex] ?? '')).trim();
    const email = raw.toLowerCase();

    let verdict: RowVerdict;
    if (email.length === 0) {
      verdict = 'no-email';
    } else if (!looksLikeEmail(email)) {
      verdict = 'bad-email';
    } else if (seen.has(email)) {
      verdict = 'duplicate';
    } else {
      // Claimed even if the row is rejected below, so a later copy of the same
      // address is still reported as a duplicate -- exactly as the server does.
      seen.add(email);
      verdict = identityIndexes.some((column) => (cells[column] ?? '').trim().length > 0)
        ? 'ok'
        : 'no-identity';
    }

    counts[verdict] += 1;
    // +2: one for the header row, one because humans count from 1.
    return { rowNumber: index + 2, cells, email, verdict };
  });

  return { rows: checked, counts };
}
