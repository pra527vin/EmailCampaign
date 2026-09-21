import { describe, expect, it } from 'vitest';
import {
  DashboardRangeError,
  MAX_DASHBOARD_RANGE_DAYS,
  daysBetween,
  eachDay,
  presetRange,
  rangeBounds,
  resolveDashboardRange,
  resolveOptionalRange,
} from '@mailstrive/shared';

// A fixed "now" so the assertions do not drift with the wall clock. Late in the
// UTC day, which is where a local-timezone bug would show up.
const NOW = new Date('2026-09-16T22:30:00.000Z');

describe('presets', () => {
  it('covers today plus the preceding days, both ends inclusive', () => {
    expect(presetRange('7d', NOW)).toEqual({
      from: '2026-09-10',
      to: '2026-09-16',
      days: 7,
      preset: '7d',
    });
  });

  it('spans exactly the advertised number of days', () => {
    for (const preset of ['7d', '30d', '90d'] as const) {
      const range = presetRange(preset, NOW);
      expect(daysBetween(range.from, range.to)).toBe(range.days);
      expect(eachDay(range)).toHaveLength(range.days);
    }
  });

  it('defaults to 7 days when nothing is asked for', () => {
    expect(resolveDashboardRange({}, NOW).preset).toBe('7d');
  });

  it('lets a preset win over stale from/to left in the query string', () => {
    const range = resolveDashboardRange(
      { preset: '30d', from: '2020-01-01', to: '2020-01-02' },
      NOW,
    );
    expect(range).toEqual(presetRange('30d', NOW));
  });
});

describe('custom ranges', () => {
  it('accepts a pair of days', () => {
    expect(resolveDashboardRange({ preset: 'custom', from: '2026-03-01', to: '2026-03-31' }, NOW))
      .toEqual({ from: '2026-03-01', to: '2026-03-31', days: 31, preset: null });
  });

  it('accepts a single day as a one-day window', () => {
    const range = resolveDashboardRange({ from: '2026-03-01', to: '2026-03-01' }, NOW);
    expect(range.days).toBe(1);
    expect(eachDay(range)).toEqual(['2026-03-01']);
  });

  it('rejects a reversed pair rather than silently returning nothing', () => {
    expect(() => resolveDashboardRange({ from: '2026-03-31', to: '2026-03-01' }, NOW)).toThrow(
      DashboardRangeError,
    );
  });

  it('rejects half a range', () => {
    expect(() => resolveDashboardRange({ preset: 'custom', from: '2026-03-01' }, NOW)).toThrow(
      /both from and to/,
    );
  });

  it('rejects a date that does not exist', () => {
    // `new Date('2026-02-31')` rolls over to 3 March rather than throwing, so
    // this is the case a naive parser gets wrong.
    expect(() => resolveDashboardRange({ from: '2026-02-31', to: '2026-03-01' }, NOW)).toThrow(
      /not a real date/,
    );
  });

  it('rejects malformed input', () => {
    for (const bad of ['16-09-2026', '2026/09/16', 'yesterday', '']) {
      expect(() => resolveDashboardRange({ from: bad, to: '2026-09-16' }, NOW)).toThrow();
    }
  });

  it('caps the span so the activity scan stays bounded', () => {
    expect(() => resolveDashboardRange({ from: '2020-01-01', to: '2026-01-01' }, NOW)).toThrow(
      /at most 366 days/,
    );
    const atLimit = resolveDashboardRange({ from: '2026-01-01', to: '2026-12-31' }, NOW);
    expect(atLimit.days).toBeLessThanOrEqual(MAX_DASHBOARD_RANGE_DAYS);
  });

  it('rejects an unknown preset name', () => {
    expect(() => resolveDashboardRange({ preset: '14d' }, NOW)).toThrow(DashboardRangeError);
  });
});

describe('query bounds', () => {
  it('uses a half-open interval so the last day is fully included', () => {
    const { start, end } = rangeBounds(presetRange('7d', NOW));
    expect(start.toISOString()).toBe('2026-09-10T00:00:00.000Z');
    // The day AFTER `to`, so 2026-09-16T23:59:59.999Z falls inside.
    expect(end.toISOString()).toBe('2026-09-17T00:00:00.000Z');
    expect(new Date('2026-09-16T23:59:59.999Z').getTime()).toBeLessThan(end.getTime());
  });

  it('keeps bucket days aligned with the range across a month boundary', () => {
    const range = resolveDashboardRange({ from: '2026-02-26', to: '2026-03-02' }, NOW);
    expect(eachDay(range)).toEqual([
      '2026-02-26',
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });

  it('handles a leap day', () => {
    const range = resolveDashboardRange({ from: '2028-02-27', to: '2028-03-01' }, NOW);
    expect(eachDay(range)).toContain('2028-02-29');
    expect(range.days).toBe(4);
  });
});

describe('optional ranges, for a list that shows everything by default', () => {
  it('returns no window when nothing is asked for', () => {
    // Unlike the dashboard, which falls back to a preset.
    expect(resolveOptionalRange({}, NOW)).toBeNull();
    expect(resolveDashboardRange({}, NOW).preset).toBe('7d');
  });

  it('returns no window for the explicit all-time option', () => {
    expect(resolveOptionalRange({ preset: 'all' }, NOW)).toBeNull();
  });

  it('ignores stale from/to when all-time is chosen', () => {
    expect(
      resolveOptionalRange({ preset: 'all', from: '2026-01-01', to: '2026-02-01' }, NOW),
    ).toBeNull();
  });

  it('resolves a preset exactly as the dashboard does', () => {
    expect(resolveOptionalRange({ preset: '30d' }, NOW)).toEqual(presetRange('30d', NOW));
  });

  it('resolves a custom pair', () => {
    expect(resolveOptionalRange({ preset: 'custom', from: '2026-03-01', to: '2026-03-31' }, NOW))
      .toEqual({ from: '2026-03-01', to: '2026-03-31', days: 31, preset: null });
  });

  it('still rejects a range that makes no sense', () => {
    expect(() => resolveOptionalRange({ from: '2026-03-31', to: '2026-03-01' }, NOW)).toThrow(
      DashboardRangeError,
    );
    expect(() => resolveOptionalRange({ from: '2026-02-31', to: '2026-03-01' }, NOW)).toThrow(
      /not a real date/,
    );
    expect(() => resolveOptionalRange({ preset: 'custom', from: '2026-03-01' }, NOW)).toThrow(
      /both from and to/,
    );
  });
});
