'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Button, Input, Select } from '@/components/ui';

/**
 * The dashboard's date filter.
 *
 * A dropdown rather than a row of buttons: it keeps the page header to one
 * control at any width, and the chosen range stays readable as a sentence
 * instead of having to be inferred from which button is filled.
 *
 * "Custom" reveals two date fields and an Apply button rather than refetching
 * on every keystroke: a half-typed year would otherwise fire a request for the
 * year 20, and a range is only meaningful once both ends are set.
 *
 * Days are UTC calendar days throughout, matching how the server buckets the
 * activity chart. `<input type="date">` yields a bare YYYY-MM-DD with no
 * timezone attached, so the value passes through untouched.
 */

export type RangePreset = 'all' | '7d' | '30d' | '90d' | 'custom';

export interface RangeSelection {
  preset: RangePreset;
  from?: string;
  to?: string;
}

const PRESETS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom' },
] as const satisfies ReadonlyArray<{ value: RangePreset; label: string }>;

const ALL_TIME = { value: 'all', label: 'All time' } as const;

/** Today in UTC, to cap the pickers at a day that can actually have data. */
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DateRangeFilter({
  value,
  onChange,
  /** The window the server actually resolved, echoed back for the caption. */
  resolved,
  /**
   * Offer "All time", and lead with it.
   *
   * A dashboard always reports on some window. A table does not -- "all of
   * them" is the sensible starting state there, and a filter that silently hid
   * older rows would be worse than no filter.
   */
  allowAll = false,
  label = 'Date range',
  layout = 'header',
}: {
  value: RangeSelection;
  onChange: (next: RangeSelection) => void;
  resolved?: { from: string; to: string; days: number };
  allowAll?: boolean;
  label?: string;
  /**
   * Where this is being used.
   *
   * `header` is the page-header corner: right-aligned, with a caption spelling
   * out the resolved window. `inline` is one control among several in a filter
   * row -- left-aligned, and without the caption, whose extra line would make
   * this field taller than its neighbours and throw the row's baseline out.
   * The validation message still shows in both, because that one is not
   * decoration.
   */
  layout?: 'header' | 'inline';
}) {
  const options = allowAll ? [ALL_TIME, ...PRESETS] : PRESETS;
  const today = utcToday();

  // Drafts, so typing a date does not refetch until both ends are chosen.
  const [from, setFrom] = useState(value.from ?? resolved?.from ?? today);
  const [to, setTo] = useState(value.to ?? resolved?.to ?? today);

  // When a preset resolves, seed the custom fields from it. Switching to
  // Custom then starts from the window already on screen rather than an
  // arbitrary default the user has to correct.
  useEffect(() => {
    if (value.preset !== 'custom' && resolved) {
      setFrom(resolved.from);
      setTo(resolved.to);
    }
  }, [value.preset, resolved]);

  const custom = value.preset === 'custom';
  const reversed = Boolean(from && to && from > to);
  const incomplete = !from || !to;
  const applied = custom && value.from === from && value.to === to;

  const inline = layout === 'inline';

  return (
    <div className={clsx('flex flex-col gap-2', !inline && 'sm:items-end')}>
      {/* One wrapping row, so it keeps a single line on a wide screen and
          stacks cleanly on a narrow one. */}
      <div
        className={clsx(
          'flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center',
          !inline && 'sm:justify-end',
        )}
      >
        <Select
          aria-label={label}
          sizing="sm"
          value={value.preset}
          onChange={(event) => {
            const preset = event.target.value as RangePreset;
            onChange(preset === 'custom' ? { preset, from, to } : { preset });
          }}
          className="w-full sm:w-[10.5rem]"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        {custom && (
          <>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                aria-label="From date"
                sizing="sm"
                max={to || today}
                value={from}
                invalid={reversed}
                onChange={(event) => setFrom(event.target.value)}
                className="w-full sm:w-[9.5rem]"
              />
              <span aria-hidden className="shrink-0 text-xs text-slate-400">
                to
              </span>
              <Input
                type="date"
                aria-label="To date"
                sizing="sm"
                min={from || undefined}
                max={today}
                value={to}
                invalid={reversed}
                onChange={(event) => setTo(event.target.value)}
                className="w-full sm:w-[9.5rem]"
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={incomplete || reversed || applied}
              onClick={() => onChange({ preset: 'custom', from, to })}
            >
              Apply
            </Button>
          </>
        )}
      </div>

      {/* One line that always says exactly what is on screen, so a custom
          range is never ambiguous about which end is which. Inline it appears
          only when something is wrong, so the row keeps its height. */}
      {(reversed || (!inline && value.preset !== 'all' && resolved)) && (
        <p
          className={clsx('text-xs text-slate-500', !inline && 'sm:text-right')}
          role="status"
        >
          {reversed ? (
            <span className="font-semibold text-red-600">
              The start date must not be after the end date.
            </span>
          ) : (
            resolved && (
              <>
                Showing {formatDay(resolved.from)} – {formatDay(resolved.to)} ({resolved.days}{' '}
                {resolved.days === 1 ? 'day' : 'days'})
              </>
            )
          )}
        </p>
      )}
    </div>
  );
}

/** A bare YYYY-MM-DD, formatted without letting the local timezone shift it. */
function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
