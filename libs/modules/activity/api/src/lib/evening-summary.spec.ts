import { ActivityStats } from '@pd/contracts';
import { isSummaryDue, summaryOf } from './evening-summary';

describe('isSummaryDue', () => {
  it('comes once a day, from the chosen time on', () => {
    expect(isSummaryDue('21:00', '2026-10-02', { date: '2026-10-03', time: '20:55' })).toBe(false);
    expect(isSummaryDue('21:00', '2026-10-02', { date: '2026-10-03', time: '21:05' })).toBe(true);
    expect(isSummaryDue('21:00', '2026-10-03', { date: '2026-10-03', time: '22:00' })).toBe(false);
    expect(isSummaryDue(null, null, { date: '2026-10-03', time: '22:00' })).toBe(false);
  });
});

describe('summaryOf', () => {
  const stats = (totalSeconds: number) =>
    ({
      totalSeconds,
      categories: [
        { category: 'development', seconds: 3000 },
        { category: 'games', seconds: 2000 },
        { category: 'browsing', seconds: 500 },
        { category: 'media', seconds: 100 },
      ],
    }) as ActivityStats;

  it('sums up a day with some time at the computer, the top three categories', () => {
    const summary = summaryOf(stats(5600), { completed: 2, seconds: 3000 }, []);
    expect(summary?.categories.map((c) => c.category)).toEqual([
      'development',
      'games',
      'browsing',
    ]);
  });

  it('skips a day with almost nothing', () => {
    expect(summaryOf(stats(300), { completed: 0, seconds: 0 }, [])).toBeNull();
  });
});
