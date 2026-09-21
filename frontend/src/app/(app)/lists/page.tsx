'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { ImportModal, type ImportDetails } from '@/components/import-modal';
import { Glyph } from '@/components/icons';
import { Modal } from '@/components/modal';
import { RecipientEditorModal } from '@/components/recipient-editor';
import {
  placeholderFor,
  readCsvPreview,
  suggestMapping,
  type ColumnChoice,
  type CsvPreview,
} from '@/lib/csv-preview';
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  formatBytes,
  formatDate,
  formatNumber,
  IconButton,
  PageHeader,
  Pagination,
  SearchInput,
  Spinner,
  StatusBadge,
} from '@/components/ui';
import type { ImportSummary, Paginated, RecipientList } from '@/lib/types';

/** Ten rows a page, matching every other table in the app. */
const PAGE_SIZE = 10;

export default function RecipientsPage() {
  const [data, setData] = useState<Paginated<RecipientList> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // --- Import ---------------------------------------------------------------
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [choices, setChoices] = useState<ColumnChoice[]>([]);
  const [reading, setReading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  // --- Editing and deleting a list -----------------------------------------
  const [editing, setEditing] = useState<RecipientList | null>(null);
  const [deleting, setDeleting] = useState<RecipientList | null>(null);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (appliedSearch) query.set('search', appliedSearch);
    try {
      setData(await api.get<Paginated<RecipientList>>(`/recipient-lists?${query}`));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [page, appliedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  function openPicker() {
    setUploadError(null);
    setSummary(null);
    fileRef.current?.click();
  }

  function closeImport() {
    setFile(null);
    setPreview(null);
    setChoices([]);
    setUploadError(null);
    // Cleared so choosing the same file again still fires `change`.
    if (fileRef.current) fileRef.current.value = '';
  }

  /**
   * The file is read in the browser first, so the review modal can show every
   * row and grade it before 25 MB goes over the wire.
   */
  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    if (!chosen) return;

    setReading(true);
    setUploadError(null);
    setSummary(null);
    try {
      const read = await readCsvPreview(chosen);
      setFile(chosen);
      setPreview(read);
      setChoices(suggestMapping(read.headers));
    } catch (caught) {
      setFile(null);
      setPreview(null);
      setError(caught instanceof Error ? caught.message : 'Could not read that file.');
      if (fileRef.current) fileRef.current.value = '';
    } finally {
      setReading(false);
    }
  }

  async function handleConfirm(details: ImportDetails) {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', details.name);
    if (details.description.trim()) formData.append('description', details.description.trim());
    formData.append('skipSuppressed', String(details.skipSuppressed));
    // The mapping is sent as the uploader saw it. The server re-parses the file
    // and re-applies this authoritatively -- the preview is never trusted.
    formData.append(
      'columnMap',
      JSON.stringify(
        choices.map((choice) => ({
          index: choice.index,
          header: choice.header,
          target: choice.target,
          ...(choice.target === 'custom' ? { key: placeholderFor(choice) ?? choice.key } : {}),
        })),
      ),
    );

    setSubmitting(true);
    setUploadError(null);
    try {
      const result = await api.upload<{ listId: string; summary: ImportSummary }>(
        '/recipient-lists/upload',
        formData,
      );
      setSummary(result.summary);
      closeImport();
      setPage(1);
      await load();
    } catch (caught) {
      // A rejected import still returns the summary, which is the useful part.
      if (caught instanceof ApiError && caught.code === 'UNPROCESSABLE_ENTITY') {
        setSummary(caught.details as ImportSummary);
        closeImport();
      }
      setUploadError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Recipients"
        description="Imported merchant and customer lists. Each import keeps its own history."
        actions={
          <Button onClick={openPicker} loading={reading}>
            Upload CSV
          </Button>
        }
      />

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileChange}
        className="hidden"
      />

      {error && (
        <div className="mb-4">
          <Alert tone="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      {summary && (
        <div className="mb-4">
          <ImportSummaryAlert summary={summary} onDismiss={() => setSummary(null)} />
        </div>
      )}

      <Card
        title="Lists"
        actions={
          <SearchInput
            value={search}
            onChange={setSearch}
            onSubmit={() => {
              setPage(1);
              setAppliedSearch(search.trim());
            }}
            onReset={() => {
              setSearch('');
              setPage(1);
              setAppliedSearch('');
            }}
            placeholder="Search lists"
            label="Search recipients"
          />
        }
      >
        {!data ? (
          <Spinner label="Loading lists" />
        ) : data.items.length === 0 ? (
          <EmptyState
            title={appliedSearch ? 'No lists matched' : 'No recipients yet'}
            description={
              appliedSearch
                ? 'Try a different search term.'
                : 'Upload a CSV with an email column and a name or merchant column. Any extra columns are preserved and become template variables.'
            }
            action={appliedSearch ? undefined : <Button onClick={openPicker}>Upload CSV</Button>}
          />
        ) : (
          <>
            <DataTable
              items={data.items}
              getKey={(list) => list.id}
              actions={(list) => (
                <>
                  <IconButton
                    label={`Edit ${list.name}`}
                    onClick={() => setEditing(list)}
                  >
                    <Glyph name="edit" />
                  </IconButton>
                  <IconButton
                    label={`Delete ${list.name}`}
                    tone="danger"
                    onClick={() => setDeleting(list)}
                  >
                    <Glyph name="trash" />
                  </IconButton>
                </>
              )}
              columns={[
                {
                  key: 'name',
                  header: 'Name',
                  primary: true,
                  cell: (list) => (
                    <>
                      <Link
                        href={`/lists/${list.id}`}
                        className="font-semibold text-slate-900 transition-colors hover:text-brand-700"
                      >
                        {list.name}
                      </Link>
                      {list.campaignCount > 0 && (
                        <span className="ml-2 text-xs text-slate-400">
                          {list.campaignCount} campaign{list.campaignCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (list) => <StatusBadge status={list.status} />,
                },
                {
                  key: 'recipients',
                  header: 'Recipients',
                  align: 'right',
                  cell: (list) => (
                    <span className="font-bold tabular-nums">
                      {formatNumber(list.recipientCount)}
                    </span>
                  ),
                },
                {
                  key: 'invalid',
                  header: 'Invalid',
                  align: 'right',
                  hide: 'lg',
                  cell: (list) => (
                    <span className="tabular-nums text-slate-500">
                      {formatNumber(list.invalidCount)}
                    </span>
                  ),
                },
                {
                  key: 'duplicates',
                  header: 'Duplicates',
                  align: 'right',
                  hide: 'lg',
                  cell: (list) => (
                    <span className="tabular-nums text-slate-500">
                      {formatNumber(list.duplicateCount)}
                    </span>
                  ),
                },
                {
                  key: 'source',
                  header: 'Source file',
                  hide: 'xl',
                  cell: (list) => (
                    <span className="text-slate-500">
                      <span className="block max-w-[16rem] truncate">{list.sourceFileName}</span>
                      <span className="text-xs text-slate-400">
                        {formatBytes(list.sourceFileSize)}
                      </span>
                    </span>
                  ),
                },
                {
                  key: 'imported',
                  header: 'Imported',
                  hide: 'md',
                  cell: (list) => (
                    <span className="whitespace-nowrap text-xs text-slate-500">
                      {formatDate(list.createdAt)}
                    </span>
                  ),
                },
              ]}
            />
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      <ImportModal
        open={Boolean(preview)}
        file={file}
        headers={preview?.headers ?? []}
        rows={preview?.rows ?? []}
        truncated={preview?.truncated ?? false}
        choices={choices}
        onChoicesChange={setChoices}
        onClose={closeImport}
        onConfirm={handleConfirm}
        submitting={submitting}
        error={uploadError}
      />

      <RecipientEditorModal
        list={editing}
        onClose={() => setEditing(null)}
        onChanged={() => void load()}
      />

      <DeleteListModal
        list={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null);
          void load();
        }}
      />
    </>
  );
}

/** What the import actually did, which may differ from what the preview predicted. */
function ImportSummaryAlert({
  summary,
  onDismiss,
}: {
  summary: ImportSummary;
  onDismiss: () => void;
}) {
  return (
    <Alert
      tone={summary.importedRecipients > 0 ? 'success' : 'warning'}
      title="Import summary"
      onDismiss={onDismiss}
    >
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
        <SummaryRow label="Total rows" value={summary.totalRows} />
        <SummaryRow label="Valid" value={summary.validRecipients} />
        <SummaryRow label="Invalid" value={summary.invalidRecipients} />
        <SummaryRow label="Duplicates" value={summary.duplicateRecipients} />
        <SummaryRow label="Suppressed" value={summary.suppressedRecipients} />
        <SummaryRow label="Imported" value={summary.importedRecipients} />
      </dl>
      {summary.errors?.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold">
            Show {summary.errors.length} rejected row{summary.errors.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto font-mono text-xs">
            {summary.errors.map((row, index) => (
              <li key={`${row.row}-${index}`}>
                Row {row.row}: {row.email ?? '(no email)'} — {row.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Alert>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4 text-xs">
      <dt>{label}</dt>
      <dd className="font-semibold tabular-nums">{formatNumber(value)}</dd>
    </div>
  );
}

function DeleteListModal({
  list,
  onClose,
  onDeleted,
}: {
  list: RecipientList | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (list) setError(null);
  }, [list]);

  async function remove() {
    if (!list) return;
    setDeleting(true);
    try {
      await api.delete(`/recipient-lists/${list.id}`);
      onDeleted();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  const inUse = (list?.campaignCount ?? 0) > 0;

  return (
    <Modal
      open={Boolean(list)}
      title="Delete this list?"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void remove()}
            loading={deleting}
            // The server refuses this too; disabling it here just avoids
            // offering an action that cannot succeed.
            disabled={inUse}
          >
            Delete list
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <p className="text-sm text-slate-700">
          <span className="font-semibold text-slate-900">{list?.name}</span> and its{' '}
          {formatNumber(list?.recipientCount ?? 0)} recipient
          {list?.recipientCount === 1 ? '' : 's'} will be removed. This cannot be undone.
        </p>
        {inUse && (
          <Alert tone="warning">
            This list is used by {list?.campaignCount} campaign
            {list?.campaignCount === 1 ? '' : 's'}, so it cannot be deleted. Delete those campaigns
            first.
          </Alert>
        )}
      </div>
    </Modal>
  );
}
