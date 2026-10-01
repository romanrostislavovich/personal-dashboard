import { contributionStats, yearsToSync } from './contribution-stats';
import { languageShares } from './github-graphql.client';

describe('contributionStats', () => {
  const today = { year: 2026, month: 10, day: 1 };

  it('counts today, the week and the record day', () => {
    const stats = contributionStats(
      [
        { day: '2026-09-20', count: 9 },
        { day: '2026-09-25', count: 4 },
        { day: '2026-09-30', count: 2 },
        { day: '2026-10-01', count: 3 },
      ],
      today,
    );
    expect(stats.today).toBe(3);
    // September 25 is the first of the 7 days, September 20 is outside.
    expect(stats.week).toBe(9);
    expect(stats.busiestDay).toEqual({ day: '2026-09-20', count: 9 });
  });

  it('does not count a day without contributions as part of a streak', () => {
    const stats = contributionStats(
      [
        { day: '2026-09-27', count: 1 },
        { day: '2026-09-28', count: 0 },
        { day: '2026-09-29', count: 2 },
        { day: '2026-09-30', count: 5 },
        { day: '2026-10-01', count: 0 },
      ],
      today,
    );
    // Today is not over, so the streak of September 29–30 is still alive.
    expect(stats.streak).toEqual({ current: 2, longest: 2 });
    expect(stats.today).toBe(0);
  });

  it('is empty without contributions', () => {
    expect(contributionStats([], today)).toEqual({
      today: 0,
      week: 0,
      streak: { current: 0, longest: 0 },
      busiestDay: null,
    });
  });
});

describe('yearsToSync', () => {
  it('asks for the whole history on the first sync', () => {
    expect(yearsToSync(2023, 2026, [])).toEqual([2023, 2024, 2025, 2026]);
  });

  it('then only refreshes the current and the previous year', () => {
    expect(yearsToSync(2020, 2026, [2020, 2021, 2022, 2023, 2024, 2025, 2026])).toEqual([
      2025, 2026,
    ]);
  });

  it('fills a year that was not saved', () => {
    expect(yearsToSync(2022, 2026, [2022, 2024, 2025, 2026])).toEqual([2023, 2025, 2026]);
  });
});

describe('languageShares', () => {
  it('sums the bytes of a language across repositories, largest first', () => {
    const ts = { name: 'TypeScript', color: '#3178c6' };
    const css = { name: 'CSS', color: null };
    const shares = languageShares([
      {
        languages: {
          edges: [
            { size: 100, node: ts },
            { size: 500, node: css },
          ],
        },
      },
      { languages: { edges: [{ size: 700, node: ts }] } },
    ]);
    expect(shares).toEqual([
      { ...ts, bytes: 800 },
      { ...css, bytes: 500 },
    ]);
  });
});
