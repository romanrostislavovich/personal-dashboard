import { DailyMetric } from '@pd/contracts';
import { moodInsights } from './mood-insights';

const period = { from: '2026-10-01', to: '2026-10-10' };
const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
const metric = (key: string, values: Record<number, number>): DailyMetric => ({
  key,
  module: key.split('.')[0],
  labelKey: key,
  unit: key === 'diary.mood' ? 'score' : 'hours',
  days: Object.entries(values).map(([n, value]) => ({ day: day(Number(n)), value })),
});

// Good days: 1, 2, 3. Bad days: 6, 7, 8. Day 5 is in the middle; day 9 has no mood.
const mood = metric('diary.mood', { 1: 5, 2: 4, 3: 4, 5: 3, 6: 2, 7: 1, 8: 2 });

describe('moodInsights', () => {
  it('compares a number on the good days with the bad ones, the largest difference first', () => {
    const result = moodInsights(
      [
        mood,
        metric('activity.hours', { 1: 4, 2: 5, 3: 6, 6: 10, 7: 9, 8: 11, 9: 20 }),
        metric('music.plays', { 1: 30, 2: 30, 3: 30, 6: 28, 7: 30, 8: 30 }),
        // Days without the number are zero: games on the bad days and once on a good one.
        metric('activity.games', { 1: 0.3, 2: 0.3, 6: 3, 7: 1.5, 8: 3 }),
        // Seen on one day only: too rare to say anything.
        metric('tasks.done', { 1: 4 }),
      ],
      period,
    );
    expect(result).toMatchObject({ days: 7, goodDays: 3, badDays: 3, enough: true });
    expect(
      result.insights.map((i) => [i.key, i.onGoodDays, i.onBadDays, i.differencePercent]),
    ).toEqual([
      ['activity.games', 0.2, 2.5, -92],
      ['activity.hours', 5, 10, -50],
    ]);
  });

  it('says nothing from too few days of either kind', () => {
    const fewBad = metric('diary.mood', { 1: 5, 2: 4, 3: 4, 6: 2 });
    const result = moodInsights([fewBad, metric('activity.hours', { 1: 1, 6: 9 })], period);
    expect(result).toMatchObject({ goodDays: 3, badDays: 1, enough: false, insights: [] });
  });

  it('copes with no mood at all', () => {
    expect(moodInsights([metric('activity.hours', { 1: 1 })], period)).toMatchObject({
      days: 0,
      enough: false,
      insights: [],
    });
  });
});
