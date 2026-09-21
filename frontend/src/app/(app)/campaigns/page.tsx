'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { DateRangeFilter, type RangeSelection } from '@/components/date-range-filter';
import { Glyph } from '@/components/icons';
import { Modal } from '@/components/modal';
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  formatDate,
  formatNumber,
  IconButton,
  Input,
  LinkButton,
  PageHeader,
  Pagination,
  ProgressBar,
  SearchInput,
  Select,
  Spinner,
  StatusBadge,
} from '@/components/ui';
import type { Campaign, CampaignStatus, Paginated } from '@/lib/types';

/** Ten rows a page, matching every other table in the app. */
const PAGE_SIZE = 10;

/** Filter options. `''` is "everything", and leads so it reads as the default. */
const STATUS_FILTERS: ReadonlyArray<{ value: '' | CampaignStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'SENDING', label: 'Sending' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'FAILED', label: 'Failed' },
];

export default function CampaignsPage() {
  const [data, setData] = useState<Paginated<Campaign> | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | CampaignStatus>('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [range, setRange] = useState<RangeSelection>({ preset: 'all' });
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function withBusy(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  // Built outside the effect so its dependency is a string. An object literal
  // would be a new value every render and would restart the poll each time.
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status) query.set('status', status);
  if (appliedSearch) query.set('search', appliedSearch);
  if (range.preset !== 'all') {
    query.set('preset', range.preset);
    if (range.preset === 'custom' && range.from && range.to) {
      query.set('from', range.from);
      query.set('to', range.to);
    }
  }
  const queryString = query.toString();

  const filtered = Boolean(status || appliedSearch || range.preset !== 'all');

  function clearFilters() {
    setPage(1);
    setStatus('');
    setSearch('');
    setAppliedSearch('');
    setRange({ preset: 'all' });
  }

  const load = useCallback(async () => {
    try {
      setData(await api.get<Paginated<Campaign>>(`/campaigns?${queryString}`));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [queryString]);

  useEffect(() => {
    void load();
    // Refresh periodically so an in-flight campaign's counters move.
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Every send, with its full recipient-level history."
        actions={<LinkButton href="/campaigns/new" variant="primary">New campaign</LinkButton>}
      />

      {error && (
        <div className="mb-4">
          <Alert tone="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      <Card title="All campaigns">
        {/* One filter row rather than controls scattered into the card header:
            the three narrow this list together, and reading them as a sentence
            is what makes an empty result explicable. */}
        <div className="mb-4 flex flex-col gap-3 border-b border-[#EEF1F5] pb-4 lg:flex-row lg:flex-wrap lg:items-start">
          <Field label="Search" htmlFor="campaign-search" className="min-w-0 lg:w-[19rem]">
            <SearchInput
              id="campaign-search"
              value={search}
              onChange={setSearch}
              onSubmit={() => {
                setPage(1);
                setAppliedSearch(search.trim());
              }}
              onReset={() => {
                setPage(1);
                setSearch('');
                setAppliedSearch('');
              }}
              placeholder="Campaign name"
              label="Search campaigns by name"
            />
          </Field>

          <Field label="Status" htmlFor="campaign-status" className="min-w-0 lg:w-[11rem]">
            <Select
              id="campaign-status"
              sizing="sm"
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as '' | CampaignStatus);
              }}
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Created" htmlFor="campaign-range" className="min-w-0">
            <DateRangeFilter
              value={range}
              onChange={(next) => {
                setPage(1);
                setRange(next);
              }}
              allowAll
              layout="inline"
              label="Filter by creation date"
            />
          </Field>

          {filtered && (
            <div className="lg:ml-auto">
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          )}
        </div>

        {!data ? (
          <Spinner label="Loading campaigns" />
        ) : data.items.length === 0 ? (
          <EmptyState
            // An account with campaigns that the filters exclude needs a
            // different message from one with no campaigns at all.
            title={filtered ? 'No campaigns matched' : 'No campaigns yet'}
            description={
              filtered
                ? 'No campaign matches the current search, status and date filters.'
                : 'Pick a recipient list and a template to create your first campaign.'
            }
            action={
              filtered ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <LinkButton href="/campaigns/new" variant="primary">
                  New campaign
                </LinkButton>
              )
            }
          />
        ) : (
          <>
            <DataTable
              items={data.items}
              getKey={(campaign) => campaign.id}
              columns={[
                {
                  key: 'name',
                  header: 'Campaign',
                  primary: true,
                  cell: (campaign) => (
                    <>
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="font-medium text-slate-900 transition-colors hover:text-brand-700"
                      >
                        {campaign.name}
                      </Link>
                      <span className="block max-w-sm truncate text-xs text-slate-500">
                        {campaign.subject}
                      </span>
                      <span className="block truncate text-xs text-slate-400">
                        {campaign.list?.name} · {campaign.template?.name}
                      </span>
                    </>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (campaign) => <StatusBadge status={campaign.status} />,
                },
                {
                  key: 'progress',
                  header: 'Progress',
                  hide: 'md',
                  className: 'w-[190px]',
                  cell: (campaign) => {
                    const percent =
                      campaign.totalRecipients === 0
                        ? 0
                        : ((campaign.sentCount + campaign.failedCount + campaign.skippedCount) /
                            campaign.totalRecipients) *
                          100;
                    return (
                      <div className="max-w-[150px]">
                        <ProgressBar
                          value={percent}
                          size="sm"
                          // Green means "finished and delivered", red means it
                          // ended in failures, and blue is reserved for a run
                          // still in flight. A finished-but-failed campaign
                          // reading as either of the other two would be wrong.
                          tone={
                            campaign.failedCount > 0
                              ? 'danger'
                              : campaign.status === 'COMPLETED'
                                ? 'accent'
                                : 'brand'
                          }
                        />
                        <span className="mt-[5px] block text-xs tabular-nums text-slate-500">
                          {formatNumber(campaign.sentCount)} /{' '}
                          {formatNumber(campaign.totalRecipients)}
                        </span>
                      </div>
                    );
                  },
                },
                {
                  key: 'sent',
                  header: 'Sent',
                  align: 'right',
                  cell: (campaign) => (
                    <span className="font-bold tabular-nums">
                      {formatNumber(campaign.sentCount)}
                    </span>
                  ),
                },
                {
                  key: 'failed',
                  header: 'Failed',
                  align: 'right',
                  hide: 'lg',
                  cell: (campaign) => (
                    <span className="tabular-nums text-red-600">
                      {campaign.failedCount > 0 ? formatNumber(campaign.failedCount) : '—'}
                    </span>
                  ),
                },
                {
                  key: 'bounced',
                  header: 'Bounced',
                  align: 'right',
                  hide: 'lg',
                  cell: (campaign) => (
                    <span className="tabular-nums text-amber-700">
                      {campaign.bounceCount > 0 ? formatNumber(campaign.bounceCount) : '—'}
                    </span>
                  ),
                },
                {
                  key: 'created',
                  header: 'Created',
                  hide: 'xl',
                  cell: (campaign) => (
                    <span className="whitespace-nowrap text-slate-500">
                      {formatDate(campaign.createdAt)}
                    </span>
                  ),
                },
              ]}
              actions={(campaign) => (
                <>
                  <IconButton
                    label={`View ${campaign.name}`}
                    href={`/campaigns/${campaign.id}`}
                    disabled={busyId === campaign.id}
                  >
                    <Glyph name="view" />
                  </IconButton>
                  <IconButton
                    // The server refuses to edit anything past DRAFT: recipients
                    // already received messages built from the definition.
                    label={
                      campaign.status === 'DRAFT'
                        ? `Edit ${campaign.name}`
                        : 'Only draft campaigns can be edited'
                    }
                    disabled={campaign.status !== 'DRAFT' || busyId === campaign.id}
                    onClick={() => setEditing(campaign)}
                  >
                    <Glyph name="edit" />
                  </IconButton>
                  <IconButton
                    label={`Duplicate ${campaign.name}`}
                    disabled={busyId === campaign.id}
                    onClick={() =>
                      void withBusy(campaign.id, () =>
                        api.post(`/campaigns/${campaign.id}/duplicate`),
                      )
                    }
                  >
                    <Glyph name="duplicate" />
                  </IconButton>
                  <IconButton
                    label={`Delete ${campaign.name}`}
                    tone="danger"
                    disabled={busyId === campaign.id}
                    onClick={() => setDeleting(campaign)}
                  >
                    <Glyph name="trash" />
                  </IconButton>
                </>
              )}
            />
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>

      <EditCampaignModal
        campaign={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />

      <Modal
        open={Boolean(deleting)}
        title="Delete this campaign?"
        onClose={() => setDeleting(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busyId === deleting?.id}
              onClick={() => {
                const target = deleting;
                setDeleting(null);
                if (target) {
                  void withBusy(target.id, () => api.delete(`/campaigns/${target.id}`));
                }
              }}
            >
              Delete campaign
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{deleting?.name}</span> and its
            recipient history will be removed. This cannot be undone.
          </p>
          {deleting && ['QUEUED', 'SENDING', 'PAUSED'].includes(deleting.status) && (
            <Alert tone="warning">
              This campaign is still running. Cancel it first — the server will refuse to delete a
              campaign mid-flight.
            </Alert>
          )}
        </div>
      </Modal>
    </>
  );
}

/**
 * Edit a draft's labels.
 *
 * Only a DRAFT is editable at all, and only the fields that do not change who
 * receives what: swapping the list or template is the send flow's job, not a
 * two-field dialog's.
 */
function EditCampaignModal({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaign) return;
    setName(campaign.name);
    setSubject(campaign.subject);
    setReplyTo(campaign.replyToEmail ?? '');
    setError(null);
  }, [campaign]);

  async function save() {
    if (!campaign) return;
    setSaving(true);
    try {
      await api.put(`/campaigns/${campaign.id}`, {
        name: name.trim(),
        subject: subject.trim(),
        ...(replyTo.trim() ? { replyToEmail: replyTo.trim() } : {}),
      });
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(campaign)}
      title="Edit campaign"
      description="Drafts only. A campaign that has started is frozen."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            loading={saving}
            disabled={name.trim().length === 0 || subject.trim().length === 0}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Campaign name" htmlFor="edit-campaign-name" required>
          <Input
            id="edit-campaign-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={150}
          />
        </Field>
        <Field label="Subject" htmlFor="edit-campaign-subject" required>
          <Input
            id="edit-campaign-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={500}
          />
        </Field>
        <Field
          label="Reply-to address"
          htmlFor="edit-campaign-replyto"
          hint="Leave blank to use the configured default."
        >
          <Input
            id="edit-campaign-replyto"
            type="email"
            value={replyTo}
            onChange={(event) => setReplyTo(event.target.value)}
            maxLength={254}
          />
        </Field>
      </div>
    </Modal>
  );
}
