'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { api, errorMessage } from '@/lib/api';
import { Modal } from '@/components/modal';
import { Glyph } from '@/components/icons';
import {
  Alert,
  Button,
  Field,
  formatNumber,
  IconButton,
  Input,
  Pagination,
  Spinner,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import type { Paginated, Recipient, RecipientList } from '@/lib/types';

/**
 * Edit the people in a list.
 *
 * Rows are edited in place rather than in a second dialog: correcting a
 * misspelt name is a one-field change, and making that cost two clicks and a
 * context switch is how a list of four hundred merchants never gets tidied.
 *
 * A row is saved explicitly. Auto-saving on blur would write on every stray
 * click, and this endpoint refuses edits while a campaign is in flight -- a
 * failure the user needs to see attached to the row they were editing.
 */

const PAGE_SIZE = 10;

/** The columns worth editing here. Everything else is on the detail page. */
interface Draft {
  email: string;
  name: string;
  company: string;
}

function draftOf(recipient: Recipient): Draft {
  return {
    email: recipient.email,
    name: recipient.name ?? '',
    company: recipient.company ?? recipient.storeName ?? '',
  };
}

function isDirty(draft: Draft, recipient: Recipient): boolean {
  const original = draftOf(recipient);
  return (
    draft.email.trim() !== original.email ||
    draft.name.trim() !== original.name ||
    draft.company.trim() !== original.company
  );
}

export function RecipientEditorModal({
  list,
  onClose,
  onChanged,
}: {
  list: RecipientList | null;
  onClose: () => void;
  /** Fired after a save or rename, so the caller can refresh its own counts. */
  onChanged: () => void;
}) {
  const [data, setData] = useState<Paginated<Recipient> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One draft per row id, created lazily when a field is first touched.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // List name, kept here so the edit icon still covers renaming.
  const [listName, setListName] = useState('');
  const [renaming, setRenaming] = useState(false);

  const listId = list?.id ?? null;

  const load = useCallback(async () => {
    if (!listId) return;
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (appliedSearch) query.set('search', appliedSearch);
    try {
      setData(await api.get<Paginated<Recipient>>(`/recipient-lists/${listId}/recipients?${query}`));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [listId, page, appliedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset everything when a different list is opened, so drafts and a search
  // term from the previous one cannot leak into this one.
  useEffect(() => {
    if (!list) return;
    setListName(list.name);
    setPage(1);
    setSearch('');
    setAppliedSearch('');
    setDrafts({});
    setRowError(null);
    setSavedId(null);
    setError(null);
  }, [list]);

  function resetSearch() {
    setSearch('');
    setAppliedSearch('');
    setPage(1);
  }

  function draftFor(recipient: Recipient): Draft {
    return drafts[recipient.id] ?? draftOf(recipient);
  }

  function edit(recipient: Recipient, field: keyof Draft, value: string) {
    setDrafts((current) => ({
      ...current,
      [recipient.id]: { ...draftFor(recipient), [field]: value },
    }));
    if (rowError?.id === recipient.id) setRowError(null);
    if (savedId === recipient.id) setSavedId(null);
  }

  async function saveRow(recipient: Recipient) {
    const draft = drafts[recipient.id];
    if (!draft || !listId) return;

    setSavingId(recipient.id);
    setRowError(null);
    try {
      await api.patch(`/recipient-lists/${listId}/recipients/${recipient.id}`, {
        email: draft.email.trim(),
        name: draft.name.trim() || null,
        company: draft.company.trim() || null,
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[recipient.id];
        return next;
      });
      setSavedId(recipient.id);
      await load();
      onChanged();
    } catch (caught) {
      setRowError({ id: recipient.id, message: errorMessage(caught) });
    } finally {
      setSavingId(null);
    }
  }

  function revertRow(recipient: Recipient) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[recipient.id];
      return next;
    });
    if (rowError?.id === recipient.id) setRowError(null);
  }

  async function saveName() {
    if (!listId || !list || listName.trim() === list.name) return;
    setRenaming(true);
    try {
      await api.patch(`/recipient-lists/${listId}`, { name: listName.trim() });
      onChanged();
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setRenaming(false);
    }
  }

  const unsaved = Object.keys(drafts).length;

  return (
    <Modal
      open={Boolean(list)}
      size="xl"
      title="Edit recipients"
      description={list ? `${formatNumber(list.recipientCount)} in this list` : undefined}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            {unsaved > 0 ? (
              <span className="font-semibold text-amber-700">
                {unsaved} row{unsaved === 1 ? '' : 's'} edited but not saved
              </span>
            ) : (
              'Changes are saved one row at a time.'
            )}
          </p>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="List name" htmlFor="editor-list-name">
            <div className="flex gap-2">
              <Input
                id="editor-list-name"
                value={listName}
                onChange={(event) => setListName(event.target.value)}
                maxLength={150}
              />
              <Button
                size="sm"
                variant="secondary"
                loading={renaming}
                disabled={!list || listName.trim().length === 0 || listName.trim() === list.name}
                onClick={() => void saveName()}
              >
                Rename
              </Button>
            </div>
          </Field>

          <Field
            label="Search"
            htmlFor="editor-search"
            hint="Matches a name, a merchant or an email address."
          >
            <form
              role="search"
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setAppliedSearch(search.trim());
              }}
            >
              <div className="relative min-w-0 flex-1">
                <Input
                  id="editor-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && search.length > 0) {
                      event.preventDefault();
                      resetSearch();
                    }
                  }}
                  placeholder="Ada, Acme, ada@…"
                  className={search.length > 0 ? 'pr-8' : undefined}
                />
                {search.length > 0 && (
                  <button
                    type="button"
                    onClick={resetSearch}
                    title="Clear search"
                    aria-label="Clear search"
                    className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-lg text-slate-400 transition hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600"
                  >
                    <Glyph name="close" size={12} />
                  </button>
                )}
              </div>
              <Button size="sm" variant="secondary" type="submit">
                <Glyph name="search" />
                <span className="sr-only">Search recipients</span>
              </Button>
            </form>
          </Field>
        </div>

        {!data ? (
          <Spinner label="Loading recipients" />
        ) : data.items.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-sm text-slate-500">
            {appliedSearch ? `Nothing matched “${appliedSearch}”.` : 'This list has no recipients.'}
          </p>
        ) : (
          <div className={clsx('transition-opacity', loading && 'opacity-60')}>
            <Table>
              <thead>
                <tr>
                  <Th className="w-14 text-right">Row</Th>
                  <Th>Email</Th>
                  <Th>Name</Th>
                  <Th>Merchant</Th>
                  <Th className="w-24 text-right">Save</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((recipient) => {
                  const draft = draftFor(recipient);
                  const dirty = isDirty(draft, recipient);
                  const failed = rowError?.id === recipient.id;

                  return (
                    <Tr key={recipient.id} className={dirty ? 'bg-brand-50/40' : undefined}>
                      <Td className="text-right tabular-nums text-slate-400">
                        {recipient.rowNumber}
                      </Td>
                      <Td>
                        <Input
                          sizing="sm"
                          aria-label={`Email for row ${recipient.rowNumber}`}
                          value={draft.email}
                          invalid={failed}
                          onChange={(event) => edit(recipient, 'email', event.target.value)}
                        />
                      </Td>
                      <Td>
                        <Input
                          sizing="sm"
                          aria-label={`Name for row ${recipient.rowNumber}`}
                          value={draft.name}
                          onChange={(event) => edit(recipient, 'name', event.target.value)}
                        />
                      </Td>
                      <Td>
                        <Input
                          sizing="sm"
                          aria-label={`Merchant for row ${recipient.rowNumber}`}
                          value={draft.company}
                          onChange={(event) => edit(recipient, 'company', event.target.value)}
                        />
                      </Td>
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {dirty && (
                            <IconButton
                              label={`Discard changes to row ${recipient.rowNumber}`}
                              onClick={() => revertRow(recipient)}
                            >
                              <Glyph name="close" />
                            </IconButton>
                          )}
                          <Button
                            size="xs"
                            disabled={!dirty}
                            loading={savingId === recipient.id}
                            onClick={() => void saveRow(recipient)}
                          >
                            {savedId === recipient.id && !dirty ? 'Saved' : 'Save'}
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>

            {/* The row's own failure, shown under the table so it is never
                clipped by a narrow cell. */}
            {rowError && (
              <div className="mt-3">
                <Alert tone="error">{rowError.message}</Alert>
              </div>
            )}

            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              onChange={(next) => {
                setPage(next);
                setSavedId(null);
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
