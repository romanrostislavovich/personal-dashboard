import {LinksForecast, LinksForecasts, PastForecast} from '@pd/contracts';
import {forecastGroups} from './forecast-groups';

const forecast = (
  key: string,
  day: string,
  more: Partial<LinksForecast> = {},
): LinksForecast => ({
  key,
  module: key.split('.')[0],
  labelKey: key,
  unit: 'count',
  day,
  made: day === '2026-11-07' ? 'morning' : 'evening',
  value: 3,
  days: 120,
  error: 0.8,
  baselineError: 1,
  baseline: 'weekday',
  trusted: true,
  drivers: [],
  ...more,
});

const past = (
  day: string,
  made: PastForecast['made'],
  value: number,
  actual: number | null,
): PastForecast => ({
  key: 'tasks.done',
  day,
  made,
  value,
  trusted: true,
  actual,
});

function data(more: Partial<LinksForecasts> = {}): LinksForecasts {
  return {
    today: '2026-11-07',
    targets: ['tasks.done', 'diary.mood'],
    forecasts: [
      forecast('tasks.done', '2026-11-07'),
      forecast('diary.mood', '2026-11-07', {trusted: false}),
      forecast('tasks.done', '2026-11-08'),
    ],
    past: [
      past('2026-11-06', 'morning', 3, 2),
      past('2026-11-06', 'evening', 9, 2),
      past('2026-11-05', 'morning', 4, 4),
      past('2026-11-04', 'morning', 1, 2),
      past('2026-11-03', 'morning', 2, null),
    ],
    candidates: [],
    ...more,
  };
}

describe('the groups of the forecasts card', () => {
  it('groups by day and tells how much closer than the plain guess', () => {
    const groups = forecastGroups(data(), false);
    expect(groups.map(group => [group.day, group.made])).toEqual([
      ['2026-11-07', 'morning'],
      ['2026-11-08', 'evening'],
    ]);
    expect(groups[0].items[0].better).toBe(20);
  });

  it('counts the past of the morning forecasts only, each day once', () => {
    const [today, tomorrow] = forecastGroups(data(), false);
    const tasks = today.items[0];
    expect(tasks.past).toEqual({miss: (1 + 0 + 1) / 3, days: 3});
    expect(tasks.yesterday).toMatchObject({value: 3, actual: 2});
    // Tomorrow's "yesterday" would be today: not told there.
    expect(tomorrow.items[0].past).toBeNull();
    expect(tomorrow.items[0].yesterday).toBeNull();
  });

  it('keeps on Home the trusted ones only and no empty group', () => {
    const groups = forecastGroups(
      data({
        forecasts: [
          forecast('tasks.done', '2026-11-07'),
          forecast('diary.mood', '2026-11-07', {trusted: false}),
          forecast('tasks.done', '2026-11-08', {trusted: false}),
        ],
      }),
      true,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map(item => item.forecast.key)).toEqual([
      'tasks.done',
    ]);
  });
});
