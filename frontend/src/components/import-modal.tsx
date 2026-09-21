'use client';

import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ColumnMapper, validateMapping } from '@/components/column-mapper';
import { Modal } from '@/components/modal';
import {
  checkRows,
  placeholderFor,
  PREVIEW_MAX_ROWS,
  VERDICT_LABEL,
  willImport,
  type CheckedRow,
  type ColumnChoice,
  type RowVerdict,
} from '@/lib/csv-preview';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Field,
  formatNumber,
  Input,
  Pagination,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui';

/**
 * Review a CSV before importing it.
 *
 * The point of this screen is that nothing is committed until it is understood.
 * Every row is shown and graded under the mapping currently chosen, so changing
 * which column is the email address immediately re-grades the file -- you can
 * see a mistake costing you 400 rows before it costs you them.
 *
 * The checks mirror the server's. They do not replace it: the import re-parses
 * the file, and its summary is what actually happened.
 */

const ROWS_PER_PAGE = 10;

const VERDICT_TONE: Record<RowVerdict, 'success' | 'danger' | 'warning' | 'neutral'> = {
  ok: 'success',
  // Imports, but with nothing to personalise with -- a note, not a rejection.
  'no-identity': 'neutral',
  'no-email': 'danger',
  'bad-email': 'danger',
  duplicate: 'warning',
};

export interface ImportDetails {
  name: string;
  description: string;
  skipSuppressed: boolean;
}

export function ImportModal({
  open,
  file,
  headers,
  rows,
  truncated,
  choices,
  onChoicesChange,
  onClose,
  onConfirm,
  submitting,
  error,
}: {
  open: boolean;
  file: File | null;
  headers: string[];
  rows: string[][];
  truncated: boolean;
  choices: ColumnChoice[];
  onChoicesChange: (choices: ColumnChoice[]) => void;
  onClose: () => void;
  onConfirm: (details: ImportDetails) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'rows' | 'columns'>('rows');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [skipSuppressed, setSkipSuppressed] = useState(true);

  const mappingError = useMemo(() => validateMapping(choices), [choices]);

  // Re-graded whenever the mapping changes, which is the whole point: a row's
  // verdict depends on which columns are the email and the identity.
  const check = useMemo(() => checkRows(rows, choices), [rows, choices]);

  const visible = useMemo(
    () => (onlyProblems ? check.rows.filter((row) => !willImport(row.verdict)) : check.rows),
    [check.rows, onlyProblems],
  );

  const totalPages = Math.max(1, Math.ceil(visible.length / ROWS_PER_PAGE));
  // Clamped rather than reset: filtering to a shorter list should not throw you
  // back to page one of what you were already reading.
  const safePage = Math.min(page, totalPages);
  const pageRows = visible.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE);

  // Only a missing, malformed or repeated address stops a row importing.
  const rejected = check.counts['no-email'] + check.counts['bad-email'] + check.counts.duplicate;
  const importable = check.counts.ok + check.counts['no-identity'];
  // A file the mapping rejects imports nothing, whatever the rows say.
  const blocked = Boolean(mappingError);

  const defaultName = file ? file.name.replace(/\.csv$/i, '') : '';

  return (
    <Modal
      open={open}
      size="xl"
      title="Review before importing"
      description={
        file
          ? `${file.name} — ${formatNumber(rows.length)} row${rows.length === 1 ? '' : 's'} read`
          : undefined
      }
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            {blocked ? (
              <span className="font-semibold text-red-600">
                This file cannot be imported as mapped.
              </span>
            ) : importable > 0 ? (
              <>
                <span className="font-bold text-accent-700">{formatNumber(importable)}</span> will
                import
                {rejected > 0 && <> · {formatNumber(rejected)} skipped</>}
              </>
            ) : (
              <span className="font-semibold text-red-600">
                No row in this file can be imported.
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              loading={submitting}
              disabled={blocked || importable === 0}
              onClick={() =>
                onConfirm({ name: name.trim() || defaultName, description, skipSuppressed })
              }
            >
              Import {formatNumber(importable)} recipient{importable === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {mappingError && <Alert tone="error">{mappingError}</Alert>}

        {truncated && (
          <Alert tone="warning" title="Showing the first rows only">
            This file has more than {formatNumber(PREVIEW_MAX_ROWS)} rows, so the preview stops
            there. The import still reads the whole file.
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Badge tone="success" dot>
            {formatNumber(check.counts.ok)} ready
          </Badge>
          {check.counts['no-identity'] > 0 && (
            <Badge tone="neutral" dot>
              {formatNumber(check.counts['no-identity'])} without a name — still imported
            </Badge>
          )}
          {(['duplicate', 'no-email', 'bad-email'] as const)
            .filter((verdict) => check.counts[verdict] > 0)
            .map((verdict) => (
              <Badge key={verdict} tone={VERDICT_TONE[verdict]} dot>
                {formatNumber(check.counts[verdict])} {VERDICT_LABEL[verdict].toLowerCase()}
              </Badge>
            ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[#EEF1F5] pb-3">
          <TabButton active={tab === 'rows'} onClick={() => setTab('rows')}>
            Rows
          </TabButton>
          <TabButton active={tab === 'columns'} onClick={() => setTab('columns')}>
            Columns &amp; placeholders
          </TabButton>

          {tab === 'rows' && rejected > 0 && (
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={onlyProblems}
                onChange={(event) => {
                  setOnlyProblems(event.target.checked);
                  setPage(1);
                }}
                className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              Only the {formatNumber(rejected)} that will be skipped
            </label>
          )}
        </div>

        {tab === 'columns' ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Rename any column to control the placeholder a template uses for it. An email column
              is required, and at least one name or merchant column.
            </p>
            <ColumnMapper choices={choices} rows={rows.slice(0, 3)} onChange={onChoicesChange} />
          </div>
        ) : (
          <>
            <PreviewTable rows={pageRows} headers={headers} choices={choices} />
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={visible.length}
              onChange={setPage}
            />
          </>
        )}

        <div className="grid gap-4 border-t border-[#EEF1F5] pt-4 sm:grid-cols-2">
          <Field label="List name" htmlFor="import-name" hint="Defaults to the file name.">
            <Input
              id="import-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={defaultName}
              maxLength={150}
            />
          </Field>
          <Field label="Description" htmlFor="import-description">
            <Input
              id="import-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional note about where this list came from"
              maxLength={1000}
            />
          </Field>
        </div>

        <Checkbox
          checked={skipSuppressed}
          onChange={(event) => setSkipSuppressed(event.target.checked)}
          label="Skip addresses already on the suppression list"
          hint="Recommended. Unsubscribed and complained addresses are never mailed regardless of this setting."
        />
      </div>
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'rounded-md px-3 py-1.5 text-xs font-semibold transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        active
          ? 'bg-brand-50 text-brand-700'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      {children}
    </button>
  );
}

/**
 * The rows, headed by the placeholder each column will become rather than by
 * its raw header -- so what is read here is what a template will write.
 */
function PreviewTable({
  rows,
  headers,
  choices,
}: {
  rows: CheckedRow[];
  headers: string[];
  choices: ColumnChoice[];
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-sm text-slate-500">
        Nothing to show here.
      </p>
    );
  }

  return (
    <div className="max-h-[24rem] overflow-y-auto">
      <Table>
        <thead>
          <tr>
            <Th className="w-14 text-right">Row</Th>
            <Th className="w-44">Status</Th>
            {headers.map((header, index) => {
              const choice = choices.find((item) => item.index === index);
              const placeholder = choice ? placeholderFor(choice) : null;
              return (
                <Th key={index}>
                  <span className="block normal-case tracking-normal text-slate-900">
                    {placeholder ? `{{${placeholder}}}` : 'not imported'}
                  </span>
                  <span className="block font-normal normal-case tracking-normal text-slate-400">
                    {header || `Column ${index + 1}`}
                  </span>
                </Th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Tr key={row.rowNumber} className={row.verdict !== 'ok' ? 'bg-slate-50' : undefined}>
              <Td className="text-right tabular-nums text-slate-400">{row.rowNumber}</Td>
              <Td>
                <Badge tone={VERDICT_TONE[row.verdict]} dot>
                  {VERDICT_LABEL[row.verdict]}
                </Badge>
              </Td>
              {headers.map((_header, index) => {
                const ignored = choices.find((item) => item.index === index)?.target === 'ignore';
                return (
                  <Td
                    key={index}
                    className={clsx(
                      'max-w-[16rem] truncate',
                      ignored && 'text-slate-300 line-through',
                    )}
                    title={row.cells[index] ?? ''}
                  >
                    {row.cells[index] ?? ''}
                  </Td>
                );
              })}
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
