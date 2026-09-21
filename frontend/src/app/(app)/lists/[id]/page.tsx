'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '@/lib/api';
import { RecipientModal } from '@/components/recipient-modal';
import {
  Alert,
  Button,
  Card,
  DataTable,
  DescriptionList,
  DescriptionRow,
  EmptyState,
  formatBytes,
  formatDate,
  formatNumber,
  LinkButton,
  PageHeader,
  Pagination,
  SearchInput,
  Spinner,
  Stat,
  StatusBadge,
  VariableChip,
} from '@/components/ui';
import type { Paginated, Recipient, RecipientList } from '@/lib/types';

export default function RecipientListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [list, setList] = useState<RecipientList | null>(null);
  const [recipients, setRecipients] = useState<Paginated<Recipient> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<Recipient | null>(null);

  const loadList = useCallback(() => {
    api
      .get<RecipientList>(`/recipient-lists/${id}`)
      .then(setList)
      .catch((caught) => setError(errorMessage(caught)));
  }, [id]);

  useEffect(() => loadList(), [loadList]);

  const loadRecipients = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), pageSize: '10' });
    if (appliedSearch) query.set('search', appliedSearch);
    try {
      setRecipients(await api.get<Paginated<Recipient>>(`/recipient-lists/${id}/recipients?${query}`));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [id, page, appliedSearch]);

  useEffect(() => {
    void loadRecipients();
  }, [loadRecipients]);

  async function handleDelete() {
    if (!confirm('Delete this list and all of its recipients? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await api.delete(`/recipient-lists/${id}`);
      router.push('/lists');
    } catch (caught) {
      setError(errorMessage(caught));
      setDeleting(false);
    }
  }

  if (error && !list) return <Alert tone="error">{error}</Alert>;
  if (!list) return <Spinner label="Loading list" />;

  const errorSample = Array.isArray(list.errorSample) ? list.errorSample : [];

  return (
    <>
      <PageHeader
        title={list.name}
        description={list.description ?? `Imported from ${list.sourceFileName}`}
        actions={
          <>
            <LinkButton href={`/campaigns/new?listId=${list.id}`} variant="primary">
              Create campaign
            </LinkButton>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              Delete list
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4">
          <Alert tone="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert tone="success" onDismiss={() => setNotice(null)}>
            {notice}
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        <Stat label="Total rows" value={list.totalRows} />
        <Stat label="Valid" value={list.validCount} tone="success" />
        <Stat
          label="Invalid"
          value={list.invalidCount}
          tone={list.invalidCount > 0 ? 'warning' : 'default'}
        />
        <Stat label="Duplicates" value={list.duplicateCount} />
        <Stat label="Imported" value={list.importedCount} tone="brand" />
        <Stat label="Stored" value={list.recipientCount} />
      </div>

      <div className="mt-5 grid gap-5 sm:mt-6 sm:gap-6 lg:grid-cols-3">
        <Card title="Import details" className="lg:col-span-1">
          <DescriptionList>
            <DescriptionRow label="Status">
              <StatusBadge status={list.status} />
            </DescriptionRow>
            <DescriptionRow label="Source file">{list.sourceFileName}</DescriptionRow>
            <DescriptionRow label="File size">{formatBytes(list.sourceFileSize)}</DescriptionRow>
            <DescriptionRow label="Imported at">{formatDate(list.createdAt)}</DescriptionRow>
            <DescriptionRow label="Campaigns">{formatNumber(list.campaignCount)}</DescriptionRow>
          </DescriptionList>

          <div className="mt-4">
            <p className="mb-1.5 text-[calc(11px*var(--type-scale))] font-semibold uppercase tracking-wide text-slate-500">
              Available placeholders
            </p>
            <div className="flex flex-wrap gap-1.5">
              {list.columns.map((column) => (
                <VariableChip key={column} name={column} />
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Use any of these in a template as{' '}
              <span className="font-mono">{'{{column_name}}'}</span>.
            </p>
          </div>

          {errorSample.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-medium text-slate-600">
                {errorSample.length} rejected row{errorSample.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto font-mono text-xs text-slate-500">
                {errorSample.map((row, index) => (
                  <li key={index}>
                    Row {row.row}: {row.email ?? '(no email)'} — {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>

        <Card
          title="Recipients"
          className="lg:col-span-2"
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
              placeholder="Search email, name or store"
              label="Search recipients"
            />
          }
        >
          {!recipients ? (
            <Spinner label="Loading recipients" />
          ) : recipients.items.length === 0 ? (
            <EmptyState
              title="No recipients matched"
              description={
                appliedSearch
                  ? 'Try a different search term.'
                  : 'This list has no stored recipients.'
              }
            />
          ) : (
            <>
              <DataTable
                items={recipients.items}
                getKey={(recipient) => recipient.id}
                columns={[
                  {
                    key: 'email',
                    header: 'Email',
                    primary: true,
                    cell: (recipient) => (
                      <span className="block break-all font-mono text-xs">{recipient.email}</span>
                    ),
                  },
                  {
                    key: 'name',
                    header: 'Name',
                    hide: 'md',
                    cell: (recipient) => recipient.name ?? '—',
                  },
                  {
                    key: 'store',
                    header: 'Store',
                    hide: 'lg',
                    cell: (recipient) => recipient.storeName ?? recipient.company ?? '—',
                  },
                  {
                    key: 'custom',
                    header: 'Custom fields',
                    hide: 'xl',
                    cell: (recipient) => {
                      const entries = Object.entries(recipient.customFields ?? {});
                      if (entries.length === 0) return <span className="text-slate-400">—</span>;
                      return (
                        <div className="flex max-w-[16rem] flex-wrap justify-end gap-1 sm:justify-start">
                          {entries.slice(0, 2).map(([key, value]) => (
                            <span
                              key={key}
                              className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[calc(11px*var(--type-scale))]"
                            >
                              {key}={String(value)}
                            </span>
                          ))}
                          {entries.length > 2 && (
                            <span className="text-[calc(11px*var(--type-scale))] text-slate-400">+{entries.length - 2}</span>
                          )}
                        </div>
                      );
                    },
                  },
                ]}
                actions={(recipient) => (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      setEditing(recipient);
                    }}
                  >
                    Edit
                  </Button>
                )}
              />
              <Pagination
                page={recipients.page}
                totalPages={recipients.totalPages}
                total={recipients.total}
                onChange={setPage}
              />
            </>
          )}
        </Card>
      </div>

      <RecipientModal
        key={editing?.id ?? 'none'}
        listId={id}
        recipient={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          setNotice(`Saved changes to ${updated.email}.`);
          setEditing(null);
          void loadRecipients();
          // A new custom field widens the list's placeholder set.
          loadList();
        }}
      />
    </>
  );
}
