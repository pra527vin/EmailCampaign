'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { ActivityChart, DonutChart, type Slice } from '@/components/charts';
import { Glyph, type GlyphName } from '@/components/icons';
import { DateRangeFilter, type RangeSelection } from '@/components/date-range-filter';
import {
  Alert,
  Card,
  DataTable,
  EmptyState,
  formatDate,
  formatNumber,
  LinkButton,
  PageHeader,
  ProgressBar,
  Spinner,
  StatusBadge,
} from '@/components/ui';
import type { DashboardStats } from '@/lib/types';

const POLL_INTERVAL_MS = 10_000;

/** Outcome colours, shared by the donut and the compliance rates below it. */
const OUTCOME_COLORS = {
  sent: '#1E9E5A',
  pending: '#B9C6D2',
  failed: '#C8322B',
  bounced: '#E0A93B',
  complaints: '#845596',
} as const;

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeSelection>({ preset: '7d' });

  // Built here rather than inside the effect so the dependency is a plain
  // string: an object literal would be a new value on every render and would
  // restart the poll each time.
  const query = new URLSearchParams({ preset: range.preset });
  if (range.preset === 'custom' && range.from && range.to) {
    query.set('from', range.from);
    query.set('to', range.to);
  }
  const queryString = query.toString();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await api.get<DashboardStats>(`/dashboard/stats?${queryString}`);
        if (!cancelled) {
          setStats(data);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) setError(errorMessage(caught));
      }
    };

    void load();
    // Keeps the figures live while a campaign runs, without a websocket.
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [queryString]);

  if (error && !stats) return <Alert tone="error">{error}</Alert>;
  if (!stats) return <Spinner label="Loading dashboard" />;

  const { totals, windowed, recentCampaigns, activity } = stats;

  const outcomes: Slice[] = [
    { key: 'sent', label: 'Sent', value: windowed.sent, color: OUTCOME_COLORS.sent },
    { key: 'pending', label: 'Pending', value: windowed.pending, color: OUTCOME_COLORS.pending },
    { key: 'failed', label: 'Failed', value: windowed.failed, color: OUTCOME_COLORS.failed },
    { key: 'bounced', label: 'Bounced', value: windowed.bounced, color: OUTCOME_COLORS.bounced },
    {
      key: 'complaints',
      label: 'Complaints',
      value: windowed.complaints,
      color: OUTCOME_COLORS.complaints,
    },
  ];

  // Rates are measured against what was actually delivered, which is the
  // denominator Amazon SES and mailbox providers use.
  const rate = (value: number) => (windowed.sent === 0 ? 0 : (value / windowed.sent) * 100);

  // Every scoped card repeats the window, so a figure is never mistaken for an
  // all-time total just because the filter has scrolled out of view.
  const windowLabel =
    stats.range.preset === '7d'
      ? 'Last 7 days'
      : stats.range.preset === '30d'
        ? 'Last 30 days'
        : stats.range.preset === '90d'
          ? 'Last 90 days'
          : `${stats.range.days} day${stats.range.days === 1 ? '' : 's'}`;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Sending activity across all of your campaigns."
        actions={<DateRangeFilter value={range} onChange={setRange} resolved={stats.range} />}
      />

      {error && (
        <div className="mb-4">
          <Alert tone="warning">{error} — showing the last successful figures.</Alert>
        </div>
      )}

      {/* Row 1 — the three things you own. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(240px,1fr))] sm:gap-[18px]">
        <HeroCard
          label="Campaigns"
          value={totals.campaigns}
          href="/campaigns"
          accent="bg-brand-50 text-brand-600"
          hint={`${formatNumber(totals.emails)} messages queued all time`}
          icon="campaigns"
        />
        <HeroCard
          label="Recipients"
          value={totals.recipients}
          href="/lists"
          accent="bg-accent-50 text-accent-600"
          hint={`across ${formatNumber(totals.recipientLists)} list${totals.recipientLists === 1 ? '' : 's'}`}
          icon="recipients"
        />
        <HeroCard
          label="Templates"
          value={totals.templates}
          href="/templates"
          accent="bg-lime-50 text-lime-700"
          hint="reusable HTML designs"
          icon="templates"
        />
      </div>

      {/* Row 2 — the breakdown beside the trend, both kept short so they read
          as one band rather than two stacked blocks. */}
      <div className="mt-[18px] grid gap-[18px] lg:grid-cols-2">
        <Card title="Delivery outcomes" description={windowLabel}>
          <DonutChart
            slices={outcomes}
            totalLabel="Messages"
            empty="No messages sent yet"
            size="sm"
            legend="inline"
          />

          {/* The two ratios Amazon SES enforces, on one line so they cost a row
              rather than a block. */}
          <div className="mt-[18px] flex flex-wrap items-center justify-center gap-x-[18px] gap-y-1 border-t border-[#EEF1F5] pt-3.5">
            <Rate
              label="Bounce"
              value={rate(windowed.bounced)}
              limit={5}
              measurable={windowed.sent > 0}
            />
            <Rate
              label="Complaints"
              value={rate(windowed.complaints)}
              limit={0.1}
              measurable={windowed.sent > 0}
            />
            <span className="text-xs text-slate-500">
              {formatNumber(windowed.unsubscribed)} unsubscribed
            </span>
          </div>
        </Card>

        <Card
          title="Sending activity"
          description={windowLabel}
          fill
        >
          <ActivityChart data={activity} />
        </Card>
      </div>

      {/* Row 3 — full width. */}
      <div className="mt-[18px]">
        <Card
          title="Recent campaigns"
          description={`Created in this range — ${windowLabel.toLowerCase()}`}
          actions={
            <LinkButton href="/campaigns" variant="secondary" size="sm">
              View all
            </LinkButton>
          }
        >
          {recentCampaigns.length === 0 ? (
            <EmptyState
              // An account with campaigns that fall outside the window needs a
              // different message from one with no campaigns at all -- telling
              // an existing user to "create your first campaign" would be wrong.
              title={
                totals.campaigns === 0
                  ? 'No campaigns yet'
                  : 'No campaigns created in this range'
              }
              description={
                totals.campaigns === 0
                  ? 'Pick a recipient list and a template to create your first campaign.'
                  : 'Widen the date range, or view every campaign regardless of when it was created.'
              }
              action={
                totals.campaigns === 0 ? (
                  <LinkButton href="/campaigns/new" variant="primary">
                    New campaign
                  </LinkButton>
                ) : (
                  <LinkButton href="/campaigns" variant="secondary">
                    View all campaigns
                  </LinkButton>
                )
              }
            />
          ) : (
            <DataTable
              items={recentCampaigns}
              getKey={(campaign) => campaign.id}
              columns={[
                {
                  key: 'name',
                  header: 'Campaign',
                  primary: true,
                  cell: (campaign) => (
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="font-semibold text-slate-900 transition-colors hover:text-brand-700"
                    >
                      {campaign.name}
                    </Link>
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
                        : ((campaign.sentCount + campaign.failedCount) /
                            campaign.totalRecipients) *
                          100;
                    return (
                      <div className="max-w-[150px]">
                        <ProgressBar
                          value={percent}
                          size="sm"
                          // Green means "finished and delivered". A run that
                          // ended in failures is red, and blue is reserved for
                          // one still in flight -- a finished-but-failed
                          // campaign reading as either would be wrong.
                          tone={
                            campaign.failedCount > 0
                              ? 'danger'
                              : campaign.status === 'COMPLETED'
                                ? 'accent'
                                : 'brand'
                          }
                        />
                        <span className="mt-[5px] block text-xs tabular-nums text-slate-500">
                          {formatNumber(campaign.sentCount)} of{' '}
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
                  cell: (campaign) =>
                    campaign.failedCount > 0 ? (
                      <span className="font-bold tabular-nums text-red-600">
                        {formatNumber(campaign.failedCount)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    ),
                },
                {
                  key: 'created',
                  header: 'Created',
                  hide: 'xl',
                  cell: (campaign) => (
                    <span className="whitespace-nowrap text-xs text-slate-500">
                      {formatDate(campaign.createdAt)}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </Card>
      </div>
    </>
  );
}

/**
 * A headline figure.
 *
 * The icon sits in a flat tinted tile rather than a saturated one: three
 * gradient badges in a row pull the eye away from the numbers, which are the
 * reason the card exists.
 */
function HeroCard({
  label,
  value,
  href,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: number;
  href: string;
  hint: string;
  accent: string;
  icon: GlyphName;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-slate-200 bg-white px-5 py-[18px] shadow-card transition hover:border-brand-200 hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-2xs font-semibold uppercase tracking-[0.09em] text-slate-500">
            {label}
          </p>
          <p className="mt-1.5 text-4xl font-bold tabular-nums tracking-[-0.02em] text-slate-900">
            {formatNumber(value)}
          </p>
        </div>

        <span
          aria-hidden
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] ${accent} transition-transform group-hover:scale-105`}
        >
          <Glyph name={icon} size={17} />
        </span>
      </div>
      <p className="mt-3 truncate text-xs text-slate-500">{hint}</p>
    </Link>
  );
}

/**
 * A rate against the threshold that matters, coloured by how close it is.
 *
 * Inline rather than boxed, so the outcomes card stays short enough to sit in
 * one row beside the activity chart.
 */
function Rate({
  label,
  value,
  limit,
  measurable,
}: {
  label: string;
  value: number;
  limit: number;
  /** False when nothing has been delivered yet, so there is no ratio to state. */
  measurable: boolean;
}) {
  const over = measurable && value > limit;
  // Half the limit is the point at which it stops being comfortable.
  const nearing = measurable && !over && value > limit / 2;

  return (
    <span className="flex items-baseline gap-1.5 text-xs text-slate-500">
      <span>{label}</span>
      <span
        className={`font-bold tabular-nums ${
          over ? 'text-red-700' : nearing ? 'text-amber-700' : 'text-slate-900'
        }`}
        // 0.00% would read as "measured, and healthy". Nothing has been
        // delivered to measure against, which is a different statement.
        title={measurable ? `Amazon SES limit ${limit}%` : 'No deliveries yet'}
      >
        {measurable ? `${value.toFixed(2)}%` : '—'}
      </span>
      <span>/ {limit}%</span>
    </span>
  );
}
