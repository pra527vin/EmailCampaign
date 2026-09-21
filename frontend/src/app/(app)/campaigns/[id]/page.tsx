'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '@/lib/api';
import { Glyph } from '@/components/icons';
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  formatDate,
  formatDuration,
  formatNumber,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Spinner,
  StatusBadge,
  Tooltip,
} from '@/components/ui';
import type {
  Campaign,
  CampaignProgress,
  CampaignRecipient,
  Paginated,
  RecipientStatus,
} from '@/lib/types';

const LIVE_POLL_MS = 4_000;

/** One request per 200 rows, so an export is a handful of calls, not hundreds. */
const EXPORT_PAGE_SIZE = 200;
/**
 * A ceiling on an export, so a campaign with a million recipients cannot turn
 * one click into thousands of requests. Past it the export stops and says so,
 * rather than silently handing over a truncated file.
 */
const EXPORT_MAX_ROWS = 20_000;

/**
 * The delivery states, in the order the breakdown offers them.
 *
 * Each is a recipient's single current status, so they are mutually exclusive
 * and every count is a true share of the total -- unlike the campaign's own
 * counters, where an unsubscribe is layered on top of a delivery that already
 * happened.
 */
const DELIVERY_STATES = [
  {
    status: 'SENT',
    key: 'sent',
    label: 'Sent',
    dot: 'bg-accent-500',
    ink: 'text-accent-700',
    chip: 'border-accent-100 bg-accent-50',
  },
  {
    status: 'PENDING',
    key: 'pending',
    label: 'Pending',
    dot: 'bg-slate-400',
    ink: 'text-slate-700',
    chip: 'border-slate-200 bg-slate-100',
  },
  {
    status: 'QUEUED',
    key: 'queued',
    label: 'Queued',
    dot: 'bg-slate-400',
    ink: 'text-slate-700',
    chip: 'border-slate-200 bg-slate-100',
  },
  {
    status: 'SENDING',
    key: 'sending',
    label: 'Sending',
    dot: 'bg-brand-600',
    ink: 'text-brand-900',
    chip: 'border-brand-100 bg-brand-50',
  },
  {
    status: 'FAILED',
    key: 'failed',
    label: 'Failed',
    dot: 'bg-red-500',
    ink: 'text-red-500',
    chip: 'border-red-200 bg-red-50',
  },
  {
    status: 'BOUNCED',
    key: 'bounced',
    label: 'Bounced',
    dot: 'bg-amber-400',
    ink: 'text-amber-700',
    chip: 'border-amber-200 bg-amber-50',
  },
  {
    status: 'COMPLAINT',
    key: 'complaint',
    label: 'Complaints',
    dot: 'bg-purple-300',
    ink: 'text-purple-500',
    chip: 'border-purple-100 bg-purple-50',
  },
  {
    status: 'SKIPPED',
    key: 'skipped',
    label: 'Skipped',
    dot: 'bg-slate-400',
    ink: 'text-slate-700',
    chip: 'border-slate-200 bg-slate-100',
  },
  {
    status: 'UNSUBSCRIBED',
    key: 'unsubscribed',
    label: 'Unsubscribed',
    dot: 'bg-slate-400',
    ink: 'text-slate-700',
    chip: 'border-slate-200 bg-slate-100',
  },
] as const satisfies ReadonlyArray<{
  status: RecipientStatus;
  key: keyof CampaignProgress;
  label: string;
  dot: string;
  ink: string;
  chip: string;
}>;

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Paginated<CampaignRecipient> | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'' | RecipientStatus>('');
  /** Which state the delivery panel enlarges. Never empty; the table's may be. */
  const [focus, setFocus] = useState<RecipientStatus>('SENT');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadCampaign = useCallback(async () => {
    try {
      setCampaign(await api.get<Campaign>(`/campaigns/${id}`));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [id]);

  const loadRecipients = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (statusFilter) query.set('status', statusFilter);
    if (appliedSearch) query.set('search', appliedSearch);
    try {
      setRecipients(await api.get<Paginated<CampaignRecipient>>(`/campaigns/${id}/recipients?${query}`));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [id, page, statusFilter, appliedSearch]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  useEffect(() => {
    void loadRecipients();
  }, [loadRecipients]);

  // Poll only while something is actually moving.
  const isLive = campaign?.status === 'SENDING' || campaign?.status === 'QUEUED';
  useEffect(() => {
    if (!isLive) return;
    const timer = setInterval(() => {
      void loadCampaign();
      void loadRecipients();
    }, LIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [isLive, loadCampaign, loadRecipients]);

  async function act(action: string, label: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/campaigns/${id}/${action}`);
      setNotice(label);
      await Promise.all([loadCampaign(), loadRecipients()]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicate() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const copy = await api.post<Campaign>(`/campaigns/${id}/duplicate`);
      router.push(`/campaigns/${copy.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  /**
   * Export what the filters currently select, not just the visible page.
   *
   * The table shows 25 rows at a time, so exporting only those would hand over
   * a file that quietly disagrees with the count beside the button. This walks
   * the same filtered query to the end, or to EXPORT_MAX_ROWS.
   */
  async function handleExport() {
    if (!campaign) return;
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const rows: CampaignRecipient[] = [];
      let cursor = 1;
      let totalPages = 1;

      do {
        const query = new URLSearchParams({
          page: String(cursor),
          pageSize: String(EXPORT_PAGE_SIZE),
        });
        if (statusFilter) query.set('status', statusFilter);
        if (appliedSearch) query.set('search', appliedSearch);

        const chunk = await api.get<Paginated<CampaignRecipient>>(
          `/campaigns/${id}/recipients?${query}`,
        );
        rows.push(...chunk.items);
        totalPages = chunk.totalPages;
        cursor += 1;
      } while (cursor <= totalPages && rows.length < EXPORT_MAX_ROWS);

      downloadRecipientCsv(campaign.name, rows);

      const available = recipients?.total ?? rows.length;
      setNotice(
        rows.length < available
          ? `Exported the first ${formatNumber(rows.length)} of ${formatNumber(available)} recipients. Narrow the filter to export the rest.`
          : `Exported ${formatNumber(rows.length)} recipient${rows.length === 1 ? '' : 's'}.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setExporting(false);
    }
  }

  if (error && !campaign) return <Alert tone="error">{error}</Alert>;
  if (!campaign) return <Spinner label="Loading campaign" />;

  const progress = campaign.progress;
  const total = progress?.total ?? campaign.totalRecipients;
  const share = (value: number) => (total > 0 ? (value / total) * 100 : 0);

  const states = DELIVERY_STATES.map((state) => {
    const value = progress?.[state.key] ?? 0;
    return { ...state, value, percent: share(value) };
  });
  const active = states.find((state) => state.status === focus) ?? states[0]!;
  const problems =
    (progress?.failed ?? 0) + (progress?.bounced ?? 0) + (progress?.complaint ?? 0);

  const steps = [
    { label: 'Created', at: campaign.createdAt as string | null },
    { label: 'Started', at: campaign.startedAt },
    { label: 'Finished', at: campaign.completedAt },
  ];
  const duration = formatDuration(campaign.startedAt, campaign.completedAt);

  const config = [
    {
      label: 'From',
      value: campaign.fromName
        ? `${campaign.fromName} <${campaign.fromEmail}>`
        : campaign.fromEmail,
      mono: false,
    },
    { label: 'Reply-to', value: campaign.replyToEmail ?? '—', mono: true },
    {
      label: 'Recipient list',
      value: campaign.list
        ? `${campaign.list.name} · ${formatNumber(total)} recipient${total === 1 ? '' : 's'}`
        : '—',
      mono: false,
    },
    { label: 'Template', value: campaign.template?.name ?? '—', mono: false },
  ];

  const filterNote = statusFilter
    ? `Filtered to ${labelFor(statusFilter)}`
    : appliedSearch
      ? `Matching “${appliedSearch}”`
      : null;

  return (
    <>
      <PageHeader
        title={campaign.name}
        meta={<StatusBadge status={campaign.status} />}
        description={
          <>
            {campaign.subject}
            {' · '}
            {formatNumber(total)} recipient{total === 1 ? '' : 's'}
          </>
        }
        actions={
          <>
            {/* First, so the way out is in the same place on every detail
                screen. `push` rather than `back()`: this page is linked from
                the dashboard as well as the campaigns list, and "back" from
                there is not the campaigns list. */}
            <Button type="button" variant="secondary" onClick={() => router.push('/campaigns')}>
              <Glyph name="back" />
              Back to campaigns
            </Button>
            {campaign.status === 'DRAFT' && (
              <Button onClick={() => act('start', 'Campaign queued.')} loading={busy}>
                Start sending
              </Button>
            )}
            {(campaign.status === 'SENDING' || campaign.status === 'QUEUED') && (
              <Button variant="secondary" onClick={() => act('pause', 'Campaign paused.')} loading={busy}>
                Pause
              </Button>
            )}
            {campaign.status === 'PAUSED' && (
              <Button onClick={() => act('resume', 'Campaign resumed.')} loading={busy}>
                Resume
              </Button>
            )}
            {campaign.failedCount > 0 &&
              campaign.status !== 'SENDING' &&
              campaign.status !== 'QUEUED' &&
              campaign.status !== 'CANCELLED' && (
                <Button
                  variant="secondary"
                  onClick={() => act('retry-failed', 'Retrying failed recipients.')}
                  loading={busy}
                >
                  Retry {formatNumber(campaign.failedCount)} failed
                </Button>
              )}
            {campaign.status !== 'COMPLETED' && campaign.status !== 'CANCELLED' && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (confirm('Cancel this campaign? Unsent recipients will be skipped.')) {
                    void act('cancel', 'Campaign cancelled.');
                  }
                }}
                loading={busy}
              >
                Cancel
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={handleDuplicate} loading={busy}>
              <Glyph name="duplicate" />
              Duplicate
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
      {campaign.lastError && (
        <div className="mb-4">
          <Alert tone="error" title="Last error">{campaign.lastError}</Alert>
        </div>
      )}

      <Card padded={false}>
        <div className="grid sm:grid-cols-2">
          <div className="border-b border-[#EEF1F5] p-[22px] sm:border-b-0 sm:border-r">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
              Delivery
              <Tooltip label="delivery" side="bottom" align="start">
                Each recipient is in one state only, so these counts never
                overlap.
              </Tooltip>
            </h2>

            <div className="flex flex-wrap items-end gap-3">
              <span
                className={`text-[calc(52px*var(--type-scale))] font-bold leading-[0.9] tracking-[-0.03em] tabular-nums ${
                  active.value > 0 ? active.ink : 'text-slate-400'
                }`}
              >
                {formatNumber(active.value)}
              </span>
              <span className="pb-[3px]">
                <span className="block text-sm font-semibold text-slate-700">
                  of {formatNumber(total)} {active.label.toLowerCase()}
                </span>
                <span className="block text-xs text-slate-500">
                  {Math.round(active.percent)}% of recipients
                </span>
              </span>
            </div>

            <div
              role="img"
              aria-label={`${formatNumber(active.value)} out of ${formatNumber(total)} ${active.label.toLowerCase()}`}
              className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100"
            >
              <div
                className={active.value > 0 ? active.dot : 'bg-slate-300'}
                style={{ width: `${active.percent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {formatNumber(active.value)} out of {formatNumber(total)} {active.label.toLowerCase()}
            </p>

            {problems === 0 ? (
              <span className="mt-3.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-accent-50 px-3 py-[5px] text-xs font-bold text-accent-700">
                <i className="block h-1.5 w-1.5 rounded-full bg-accent-500" />
                No problems
              </span>
            ) : (
              <span className="mt-3.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-red-50 px-3 py-[5px] text-xs font-bold text-red-700">
                <i className="block h-1.5 w-1.5 rounded-full bg-red-500" />
                {formatNumber(problems)} need attention
              </span>
            )}
          </div>

          <div className="p-[22px]">
            <div className="mb-3.5 text-2xs font-bold uppercase tracking-[0.09em] text-slate-500">
              All states
            </div>
            <div className="flex flex-wrap gap-2">
              {states.map((state) => {
                const on = state.value > 0;
                const selected = state.status === focus;
                return (
                  <button
                    key={state.status}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setFocus(state.status);
                      setPage(1);
                      setStatusFilter(state.status);
                    }}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-[9px] text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                      on ? `${state.chip} ${state.ink}` : 'border-[#EEF1F5] bg-slate-50 text-slate-400'
                    } ${selected ? 'ring-2 ring-brand-600/40' : 'hover:border-slate-300'}`}
                  >
                    <i
                      className={`block h-[7px] w-[7px] rounded-full ${on ? state.dot : 'bg-slate-300'}`}
                    />
                    {state.label}{' '}
                    <strong className="font-bold tabular-nums">{formatNumber(state.value)}</strong>
                  </button>
                );
              })}
            </div>
            <p className="mt-3.5 text-xs text-slate-500">
              Pick a state to enlarge it and filter the table below.
            </p>
          </div>
        </div>

        <div className="border-t border-[#EEF1F5] px-[22px] pb-5 pt-[18px]">
          <div className="mb-4 text-2xs font-bold uppercase tracking-[0.09em] text-slate-500">
            Timeline
          </div>
          <ol className="flex flex-wrap items-start gap-y-3">
            {steps.map((step, index) => {
              const reached = Boolean(step.at);
              const nextReached = Boolean(steps[index + 1]?.at);
              const isLast = index === steps.length - 1;
              return (
                <li key={step.label} className="flex min-w-[150px] flex-1 flex-col gap-2">
                  <div className="flex items-center">
                    <span
                      className={`h-3.5 w-3.5 flex-none rounded-full ring-4 ${
                        reached ? 'bg-accent-500 ring-accent-50' : 'bg-slate-300 ring-slate-100'
                      }`}
                    />
                    {!isLast && (
                      <span
                        className={`h-0.5 flex-1 ${nextReached ? 'bg-accent-500' : 'bg-slate-200'}`}
                      />
                    )}
                  </div>
                  <div className="pr-3.5">
                    <div className="text-xs font-bold text-slate-900">{step.label}</div>
                    <div className="text-xs text-slate-500">
                      {reached ? formatDate(step.at) : 'Not yet'}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {duration && (
            <div className="mt-3.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-accent-50 px-2.5 py-1 text-xs font-semibold text-accent-700">
              Finished in {duration}
            </div>
          )}
        </div>
      </Card>

      <div className="mt-5 grid gap-5 sm:mt-6 sm:gap-6 lg:grid-cols-10 lg:gap-x-[10px]">
        <Card
          title="Configuration"
          hint={
            <Tooltip label="configuration" side="bottom" align="start">
              Duplicating the campaign copies all of these settings.
            </Tooltip>
          }
          description="What this campaign sends with."
          className="lg:col-span-3"
          padded={false}
        >
          <dl className="px-5 py-2">
            {config.map((row) => (
              <div key={row.label} className="border-b border-[#F2F4F7] py-[11px] last:border-b-0">
                <dt className="mb-[3px] text-xs text-slate-500">{row.label}</dt>
                <dd
                  className={`break-words text-xs font-semibold text-slate-900 ${
                    row.mono ? 'font-mono' : ''
                  }`}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="px-5 pb-5">
            <Link
              href={`/templates/${campaign.templateId}`}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-[9px] text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
            >
              <Glyph name="view" />
              Open template
            </Link>
          </div>
        </Card>

        <Card
          title="Recipients"
          className="lg:col-span-7"
          hint={
            <Tooltip label="the recipients table" side="bottom" align="start">
              Sent at is when Amazon SES accepted the message, not when it
              arrived.
            </Tooltip>
          }
          description="Every address in this campaign and what happened to it."
          actions={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleExport}
              loading={exporting}
            >
              Export CSV
            </Button>
          }
        >
          <div className="mb-4 flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={statusFilter}
              aria-label="Filter recipients by status"
              sizing="sm"
              onChange={(event) => {
                const next = event.target.value as '' | RecipientStatus;
                setPage(1);
                setStatusFilter(next);
                // Keep the enlarged state and the table in step, but leave the
                // panel on its last pick when the filter is cleared -- there is
                // no "all states" reading for a single big number.
                if (next) setFocus(next);
              }}
              className="sm:w-40"
            >
              <option value="">All statuses</option>
              {DELIVERY_STATES.map((state) => (
                <option key={state.status} value={state.status}>
                  {state.label}
                </option>
              ))}
            </Select>
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
              placeholder="Search email"
              label="Search campaign recipients"
            />
          </div>

          {!recipients ? (
            <Spinner label="Loading recipients" />
          ) : recipients.items.length === 0 ? (
            <EmptyState
              title="No recipients matched"
              description="Try a different status filter or search term."
            />
          ) : (
            <>
              <DataTable
                items={recipients.items}
                getKey={(row) => row.id}
                columns={[
                  {
                    key: 'email',
                    header: 'Email',
                    primary: true,
                    cell: (row) => (
                      <span className="block break-all font-mono text-xs">{row.email}</span>
                    ),
                  },
                  {
                    key: 'name',
                    header: 'Name',
                    hide: 'lg',
                    cell: (row) => row.recipient?.name ?? row.recipient?.storeName ?? '—',
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    cell: (row) => <StatusBadge status={row.status} />,
                  },
                  {
                    key: 'attempts',
                    header: 'Attempts',
                    align: 'right',
                    hide: 'xl',
                    cell: (row) => <span className="tabular-nums">{row.attempts}</span>,
                  },
                  {
                    key: 'sentAt',
                    header: 'Sent at',
                    hide: 'md',
                    cell: (row) => (
                      <span className="whitespace-nowrap text-slate-500">
                        {formatDate(row.sentAt)}
                      </span>
                    ),
                  },
                ]}
              />
              <Pagination
                page={recipients.page}
                totalPages={recipients.totalPages}
                total={recipients.total}
                onChange={setPage}
              />
              {filterNote && <p className="pt-2 text-xs text-slate-500">{filterNote}</p>}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function labelFor(status: RecipientStatus): string {
  return DELIVERY_STATES.find((state) => state.status === status)?.label ?? status;
}

/** RFC 4180 quoting: double the quotes, wrap anything that could break a cell. */
function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /["\n\r,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadRecipientCsv(campaignName: string, rows: CampaignRecipient[]) {
  const header = ['email', 'name', 'status', 'attempts', 'sent_at', 'error_code', 'error_message'];
  const body = rows.map((row) =>
    [
      row.email,
      row.recipient?.name ?? row.recipient?.storeName ?? '',
      row.status,
      row.attempts,
      row.sentAt ?? '',
      row.errorCode ?? '',
      row.errorMessage ?? '',
    ]
      .map(csvCell)
      .join(','),
  );

  // The BOM is what makes Excel read the file as UTF-8 rather than the local
  // code page, which otherwise mangles every non-ASCII merchant name.
  const blob = new Blob(['﻿', [header.join(','), ...body].join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${campaignName.replace(/[^\w.-]+/g, '-')}-recipients.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
