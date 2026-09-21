import type { DashboardRange } from '../types/index.js';

/**
 * Resolving a date window.
 *
 * Everything here works in **UTC calendar days**, deliberately. The activity
 * chart buckets rows with `date_trunc('day', ...)`, which the database
 * evaluates in its own timezone; if the window were computed in the browser's
 * local timezone the two would disagree and the first and last bars would be
 * wrong by a day for anyone west of UTC. One timezone, used end to end, is
 * simpler to reason about than a correction applied in two places.
 *
 * Both ends are inclusive: "last 7 days" means today plus the six before it,
 * which is what a reader expects a 7-bar chart to show.
 */

export const DASHBOARD_PRESETS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
} as const;

export type DashboardPreset = keyof typeof DASHBOARD_PRESETS;

export const DEFAULT_DASHBOARD_PRESET: DashboardPreset = '7d';

/**
 * The same window, for a list that shows everything by default.
 *
 * The dashboard always reports on some window, so it falls back to a preset.
 * A table of campaigns does not: "all of them" is the sensible starting state,
 * and a filter that silently hid older rows would be worse than no filter. So
 * this returns `null` for "no date filter" rather than inventing a default.
 */
export function resolveOptionalRange(
  input: { preset?: string | null; from?: string | null; to?: string | null } = {},
  now: Date = new Date(),
): DashboardRange | null {
  const { preset, from, to } = input;
  if (preset === 'all') return null;
  if (!preset && !from && !to) return null;
  return resolveDashboardRange(input, now);
}

/**
 * A custom range is capped rather than unbounded.
 *
 * The activity query scans `campaign_recipients` over the window, and the chart
 * draws one bar per day. Beyond a year both stop being reasonable -- the query
 * gets expensive and the bars become invisible -- so the limit is stated here
 * once instead of being discovered in production.
 */
export const MAX_DASHBOARD_RANGE_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export class DashboardRangeError extends Error {}

/** Today as a UTC calendar day, with no time component. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Parse a YYYY-MM-DD day, rejecting anything that is not a real date.
 *
 * `new Date('2026-02-31')` does not throw -- it rolls over to 3 March. Round
 * tripping through `toISOString` catches that, so a typo becomes an error the
 * caller sees rather than a silently different window.
 */
function parseDay(value: string, field: string): Date {
  if (!ISO_DAY.test(value)) {
    throw new DashboardRangeError(`${field} must be a date in YYYY-MM-DD form`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new DashboardRangeError(`${field} is not a real date`);
  }
  return parsed;
}

function addDays(day: string, delta: number): string {
  return new Date(parseDay(day, 'day').getTime() + delta * DAY_MS).toISOString().slice(0, 10);
}

/** Inclusive day count between two YYYY-MM-DD days. */
export function daysBetween(from: string, to: string): number {
  const span = parseDay(to, 'to').getTime() - parseDay(from, 'from').getTime();
  return Math.round(span / DAY_MS) + 1;
}

export function presetRange(preset: DashboardPreset, now: Date = new Date()): DashboardRange {
  const to = utcToday(now);
  const days = DASHBOARD_PRESETS[preset];
  return { from: addDays(to, -(days - 1)), to, days, preset };
}

/**
 * Turn whatever the client asked for into a concrete window.
 *
 * A `preset` wins over explicit dates, so a stale `from`/`to` left in the query
 * string cannot quietly override the button the user just pressed. With
 * neither, the default preset applies.
 */
export function resolveDashboardRange(
  input: { preset?: string | null; from?: string | null; to?: string | null } = {},
  now: Date = new Date(),
): DashboardRange {
  const { preset, from, to } = input;

  if (preset && preset !== 'custom') {
    if (!(preset in DASHBOARD_PRESETS)) {
      throw new DashboardRangeError(
        `preset must be one of ${Object.keys(DASHBOARD_PRESETS).join(', ')} or custom`,
      );
    }
    return presetRange(preset as DashboardPreset, now);
  }

  if (!from && !to) return presetRange(DEFAULT_DASHBOARD_PRESET, now);

  if (!from || !to) {
    throw new DashboardRangeError('a custom range needs both from and to');
  }

  const start = parseDay(from, 'from');
  const end = parseDay(to, 'to');

  if (start.getTime() > end.getTime()) {
    throw new DashboardRangeError('from must not be after to');
  }

  const days = daysBetween(from, to);
  if (days > MAX_DASHBOARD_RANGE_DAYS) {
    throw new DashboardRangeError(
      `a range may span at most ${MAX_DASHBOARD_RANGE_DAYS} days; that one spans ${days}`,
    );
  }

  return { from, to, days, preset: null };
}

/** Half-open [start, end) instants for querying. `end` is the day after `to`. */
export function rangeBounds(range: DashboardRange): { start: Date; end: Date } {
  return {
    start: new Date(`${range.from}T00:00:00.000Z`),
    // Exclusive upper bound, so a row stamped 23:59:59.999 on the last day is
    // included without relying on millisecond arithmetic.
    end: new Date(`${addDays(range.to, 1)}T00:00:00.000Z`),
  };
}

/** Every day in the range, ascending. The chart needs a dense series. */
export function eachDay(range: DashboardRange): string[] {
  const days: string[] = [];
  for (let offset = 0; offset < range.days; offset += 1) {
    days.push(addDays(range.from, offset));
  }
  return days;
}
