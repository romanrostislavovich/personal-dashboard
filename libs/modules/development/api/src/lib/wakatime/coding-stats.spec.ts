import {
  codingTotals,
  fillDays,
  longestCodingStreak,
  sumShares,
  syncStart,
  toHours,
} from './coding-stats';
import { parseSummary } from './wakatime.client';

const today = { year: 2026, month: 10, day: 10 };

describe('fillDays', () => {
  it('returns every day of the range with zeros for days without coding', () => {
    const days = fillDays(
      [{ day: '2026-10-09', seconds: 3600 }],
      { year: 2026, month: 10, day: 8 },
      today,
    );
    expect(days).toEqual([
      { day: '2026-10-08', seconds: 0 },
      { day: '2026-10-09', seconds: 3600 },
      { day: '2026-10-10', seconds: 0 },
    ]);
  });
});

describe('codingTotals', () => {
  it('averages over the active days only', () => {
    const totals = codingTotals([
      { day: '2026-10-07', seconds: 7200 },
      { day: '2026-10-08', seconds: 0 },
      { day: '2026-10-09', seconds: 3600 },
    ]);
    expect(totals).toEqual({
      totalSeconds: 10800,
      activeDays: 2,
      dailyAverageSeconds: 5400,
      bestDay: { day: '2026-10-07', seconds: 7200 },
    });
  });

  it('is empty without coding', () => {
    expect(codingTotals([{ day: '2026-10-09', seconds: 0 }])).toEqual({
      totalSeconds: 0,
      activeDays: 0,
      dailyAverageSeconds: 0,
      bestDay: null,
    });
  });
});

describe('longestCodingStreak', () => {
  it('ignores days without coding', () => {
    const days = [
      { day: '2026-10-05', seconds: 60 },
      { day: '2026-10-06', seconds: 60 },
      { day: '2026-10-07', seconds: 0 },
      { day: '2026-10-08', seconds: 60 },
    ];
    expect(longestCodingStreak(days, today)).toBe(2);
  });
});

describe('sumShares', () => {
  it('sums a name across days and keeps the largest', () => {
    const shares = sumShares(
      [
        { name: 'dashboard', seconds: 100 },
        { name: 'blog', seconds: 500 },
        { name: 'dashboard', seconds: 700 },
        { name: 'notes', seconds: 10 },
      ],
      2,
    );
    expect(shares).toEqual([
      { name: 'dashboard', seconds: 800 },
      { name: 'blog', seconds: 500 },
    ]);
  });
});

describe('syncStart', () => {
  it('asks for the whole window on the first sync', () => {
    expect(syncStart(null, today)).toBe('2026-10-04');
  });

  it('re-reads yesterday even when today is already saved', () => {
    expect(syncStart('2026-10-10', today)).toBe('2026-10-09');
  });

  it('continues from the last saved day after a pause', () => {
    expect(syncStart('2026-10-06', today)).toBe('2026-10-06');
  });

  it('does not reach further back than the window', () => {
    expect(syncStart('2026-09-01', today)).toBe('2026-10-04');
  });
});

describe('toHours', () => {
  it('rounds to two decimals', () => {
    expect(toHours(5400)).toBe(1.5);
    expect(toHours(100)).toBe(0.03);
  });
});

describe('parseSummary', () => {
  it('turns a day of the API answer into rows', () => {
    const day = parseSummary({
      range: { date: '2026-10-09' },
      grand_total: { total_seconds: 3725.6 },
      projects: [{ name: 'dashboard', total_seconds: 3725.6 }],
      languages: [
        { name: 'TypeScript', total_seconds: 3000.2 },
        { name: 'SCSS', total_seconds: 0.3 },
      ],
      editors: [{ name: 'VS Code', total_seconds: 3725.6 }],
    });
    expect(day).toEqual({
      day: '2026-10-09',
      totalSeconds: 3726,
      breakdown: [
        { kind: 'project', name: 'dashboard', seconds: 3726 },
        // SCSS rounds to zero seconds and is left out.
        { kind: 'language', name: 'TypeScript', seconds: 3000 },
        { kind: 'editor', name: 'VS Code', seconds: 3726 },
      ],
    });
  });
});
