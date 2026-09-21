'use client';

import clsx from 'clsx';
import { useId, useState } from 'react';
import { formatNumber } from '@/components/ui';

/**
 * Charts, drawn with SVG and plain divs.
 *
 * A charting library would be several hundred kilobytes for two small views.
 * These stay legible, keyboard-reachable and free, and they read their colours
 * from the brand palette so the dashboard matches the rest of the app.
 */

export interface Slice {
  key: string;
  label: string;
  value: number;
  /** Fill colour. Brand palette hexes, so SVG and legend always agree. */
  color: string;
}

// --- Donut ------------------------------------------------------------------

const DONUT_SIZE = 200;
const DONUT_STROKE = 26;
const RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Proportional breakdown with a readable centre.
 *
 * Hovering or focusing a segment pulls it forward and swaps the centre figure
 * to that segment, so the exact number is available without a tooltip that
 * would be unreachable on touch.
 */
export function DonutChart({
  slices,
  totalLabel = 'Total',
  empty = 'Nothing to show yet',
  size = 'md',
  legend = 'list',
}: {
  slices: Slice[];
  totalLabel?: string;
  empty?: string;
  /** `sm` keeps the card short enough to sit beside a chart in one row. */
  size?: 'sm' | 'md';
  /** `inline` wraps the keys into rows under the ring instead of a column. */
  legend?: 'list' | 'inline';
}) {
  const [active, setActive] = useState<string | null>(null);
  const titleId = useId();

  const visible = slices.filter((slice) => slice.value > 0);
  const total = visible.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return (
      <div
        className={clsx(
          'flex items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-500',
          size === 'sm' ? 'h-[160px]' : 'h-[230px]',
        )}
      >
        {empty}
      </div>
    );
  }

  const activeSlice = visible.find((slice) => slice.key === active) ?? null;
  const centreValue = activeSlice ? activeSlice.value : total;
  const centreLabel = activeSlice ? activeSlice.label : totalLabel;
  const percent = Math.round((centreValue / total) * 100);

  // Segments are laid out by walking the circumference; each one is a dash of
  // its own length followed by a gap covering the rest of the circle.
  let offset = 0;

  return (
    // Always stacked: this sits in a narrow column at every width it is used
    // at, and side-by-side truncated the legend labels to single letters.
    <div className={clsx('flex flex-col items-center', size === 'sm' ? 'gap-3' : 'gap-5')}>
      <div className="relative shrink-0">
        <svg
          viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
          className={clsx(
            '-rotate-90',
            size === 'sm' ? 'h-[156px] w-[156px]' : 'h-[208px] w-[208px] sm:h-[230px] sm:w-[230px]',
          )}
          role="img"
          aria-labelledby={titleId}
        >
          <title id={titleId}>
            {visible.map((slice) => `${slice.label}: ${slice.value}`).join(', ')}
          </title>

          <circle
            cx={DONUT_SIZE / 2}
            cy={DONUT_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="#EEF1F5"
            strokeWidth={DONUT_STROKE}
          />

          {visible.map((slice) => {
            const length = (slice.value / total) * CIRCUMFERENCE;
            const dash = `${length} ${CIRCUMFERENCE - length}`;
            const thisOffset = -offset;
            offset += length;
            const isActive = active === slice.key;

            return (
              <circle
                key={slice.key}
                cx={DONUT_SIZE / 2}
                cy={DONUT_SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={slice.color}
                strokeWidth={isActive ? DONUT_STROKE + 5 : DONUT_STROKE}
                strokeDasharray={dash}
                strokeDashoffset={thisOffset}
                strokeLinecap="butt"
                className="cursor-pointer transition-all duration-200"
                opacity={active && !isActive ? 0.35 : 1}
                onMouseEnter={() => setActive(slice.key)}
                onMouseLeave={() => setActive(null)}
              />
            );
          })}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={clsx(
              'font-bold tabular-nums tracking-[-0.01em] text-slate-900',
              size === 'sm' ? 'text-2xl' : 'text-3xl',
            )}
          >
            {formatNumber(centreValue)}
          </span>
          <span className="max-w-[8rem] truncate text-xs font-semibold tracking-[0.04em] text-slate-500">
            {centreLabel}
          </span>
          {activeSlice && (
            <span className="text-xs tabular-nums text-slate-400">{percent}%</span>
          )}
        </div>
      </div>

      <ul
        className={clsx(
          'min-w-0',
          legend === 'inline'
            ? 'flex flex-wrap justify-center gap-x-1 gap-y-0.5'
            : 'w-full max-w-xs space-y-1',
        )}
      >
        {slices.map((slice) => {
          const share = total === 0 ? 0 : Math.round((slice.value / total) * 100);
          const isActive = active === slice.key;
          return (
            <li key={slice.key}>
              <button
                type="button"
                onMouseEnter={() => setActive(slice.key)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(slice.key)}
                onBlur={() => setActive(null)}
                className={clsx(
                  'flex items-center rounded-md text-left transition',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                  legend === 'inline' ? 'gap-1.5 px-1.5 py-1' : 'w-full gap-2.5 px-2 py-1.5',
                  isActive ? 'bg-slate-100' : 'hover:bg-slate-50',
                  slice.value === 0 && 'opacity-50',
                )}
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: slice.color }}
                />
                <span
                  className={clsx(
                    'min-w-0 truncate text-sm font-medium text-slate-700',
                    legend === 'list' && 'flex-1',
                  )}
                >
                  {slice.label}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                  {formatNumber(slice.value)}
                </span>
                {/* The share only earns its space in the column layout. */}
                {legend === 'list' && (
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-400">
                    {share}%
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- Stacked bars -----------------------------------------------------------

export interface ActivityDay {
  date: string;
  sent: number;
  failed: number;
  bounced: number;
}

const SERIES = [
  { key: 'sent', label: 'Sent', color: '#1E9E5A' },
  { key: 'failed', label: 'Failed', color: '#C8322B' },
  { key: 'bounced', label: 'Bounced', color: '#E0A93B' },
] as const;

/**
 * Dates on this axis are bare YYYY-MM-DD days, bucketed by the server in UTC.
 *
 * `new Date('2026-09-16')` is parsed as UTC midnight but read back in local
 * time, so `getDate()` returns the 15th for anyone west of UTC and every label
 * on the chart is off by one. Both formatters below stay in UTC for that
 * reason -- these are calendar days, not instants, and they have no timezone
 * of their own to convert out of.
 */
function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { timeZone: 'UTC', day: 'numeric', month: 'short' });
}

/**
 * Axis tick: the day of the month.
 *
 * Taking the first word of a formatted date gives "Sep" for every column in a
 * locale that puts the month first, which labels nothing.
 */
function dayTick(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? '' : String(date.getUTCDate());
}

/**
 * Daily volume, stacked by outcome.
 *
 * Days with no activity keep their column, so the gaps in a sending schedule
 * stay visible rather than being closed up. The series length is whatever the
 * dashboard's date filter resolved to, from a single day to a year, and the
 * bar gap and tick stride scale with it.
 */
export function ActivityChart({ data }: { data: ActivityDay[] }) {
  const [active, setActive] = useState<string | null>(null);

  const totals = data.map((day) => day.sent + day.failed + day.bounced);
  const peak = Math.max(1, ...totals);
  const grandTotal = totals.reduce((sum, value) => sum + value, 0);

  if (data.length === 0 || grandTotal === 0) {
    return (
      <div className="flex h-full min-h-[14rem] items-center justify-center rounded-[10px] border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        No sending activity in this period yet.
      </div>
    );
  }

  const activeDay = data.find((day) => day.date === active) ?? null;

  // The series is no longer a fixed 14 days -- it can be 1 or 366. Two things
  // have to scale with it, or a 90-day range turns into hairline bars under an
  // unreadable smear of dates:
  //
  //  - the gap between bars, which at 6px would consume more width than the
  //    bars themselves once there are more than a month of them;
  //  - the tick stride, chosen so roughly 7-12 labels are drawn whatever the
  //    range, with the last day always labelled since it anchors the series.
  const gapClass = data.length > 60 ? 'gap-px' : data.length > 31 ? 'gap-0.5' : 'gap-1.5';
  const stride = Math.max(1, Math.ceil(data.length / 10));
  const showTick = (index: number) =>
    index === data.length - 1 || (data.length - 1 - index) % stride === 0;

  // Past about a month the day number alone repeats -- three columns labelled
  // "1" over a 90-day range says nothing -- so the month comes back.
  const tick = data.length > 31 ? shortDate : dayTick;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-3xl font-bold tabular-nums tracking-[-0.02em] text-slate-900">
            {formatNumber(grandTotal)}
          </p>
          <p className="truncate text-xs text-slate-500">
            {activeDay ? (
              <>
                <span className="font-medium text-slate-700">{shortDate(activeDay.date)}</span>{' '}
                <span className="tabular-nums">
                  {formatNumber(activeDay.sent)} sent
                  {activeDay.failed > 0 && ` · ${formatNumber(activeDay.failed)} failed`}
                  {activeDay.bounced > 0 && ` · ${formatNumber(activeDay.bounced)} bounced`}
                </span>
              </>
            ) : (
              `messages in the last ${data.length} days`
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          {SERIES.map((series) => (
            <span key={series.key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: series.color }}
              />
              {series.label}
            </span>
          ))}
        </div>
      </div>

      {/* The plot takes whatever height is left, with a floor so it stays
          readable when the card is short. The axis sits beside the bars only;
          the date row is below both, indented past the axis column. */}
      <div className="mt-[18px] flex min-h-[10rem] flex-1 flex-col">
        {/* No y-axis column and no gridlines: the reference reads the shape of
            the series, not values off a scale, and the exact figures are on the
            line above as you hover. A single baseline rule anchors the bars. */}
        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1 border-b border-slate-200">
            <div className={clsx('relative flex h-full items-end px-1', gapClass)}>
            {data.map((day) => {
              const total = day.sent + day.failed + day.bounced;
              const height = (total / peak) * 100;
              const isActive = active === day.date;

              return (
                <button
                  key={day.date}
                  type="button"
                  aria-label={`${shortDate(day.date)}: ${day.sent} sent, ${day.failed} failed, ${day.bounced} bounced`}
                  onMouseEnter={() => setActive(day.date)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(day.date)}
                  onBlur={() => setActive(null)}
                  className="group flex h-full flex-1 cursor-pointer flex-col justify-end rounded-t focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  <div
                    className={clsx(
                      'flex w-full flex-col-reverse gap-[3px] transition-all duration-200',
                      active && !isActive && 'opacity-50',
                    )}
                    style={{ height: `${Math.max(height, total > 0 ? 2 : 0)}%` }}
                  >
                    {SERIES.map((series) => {
                      const value = day[series.key];
                      if (value === 0) return null;
                      return (
                        <div
                          key={series.key}
                          className="rounded-t-[3px]"
                          style={{ flexGrow: value, backgroundColor: series.color }}
                        />
                      );
                    })}
                  </div>
                </button>
              );
            })}
            </div>
          </div>
        </div>

        {/* No axis column any more, so the ticks sit directly under the bars
            and share their gap and padding to stay aligned. */}
        <div className={clsx('mt-2 flex shrink-0 px-1', gapClass)}>
          {data.map((day, index) => (
            <span
              key={day.date}
              className="flex-1 text-center text-xs text-slate-400"
              aria-hidden
            >
              {/* Thinned to roughly ten labels, so they never collide. */}
              {showTick(index) ? tick(day.date) : ''}
            </span>
          ))}
        </div>
      </div>

    </div>
  );
}
