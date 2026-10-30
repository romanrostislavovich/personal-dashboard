import {DailyMetric, LocalDate} from '@pd/contracts';
import {daysOf, shift} from './daily-series';
import {fit, MIN_DAYS, moodForecast} from './forecast';

/** A made-up life: sleep drives the next day's mood, the steps do nothing. */
function life(days: number): DailyMetric[] {
  const all = daysOf({
    from: '2026-01-01',
    to: shift('2026-01-01', days - 1) as LocalDate,
  });
  const sleep = all.map((day, i) => ({day, value: 5 + ((i * 7) % 5)}));
  const steps = all.map((day, i) => ({
    day,
    value: 3000 + ((i * 13) % 9) * 1000,
  }));
  const sleepOf = new Map(sleep.map(one => [one.day, one.value]));
  const mood = all.slice(1).map(day => ({
    day,
    // 5 h of sleep → a bad day, 9 h → a great one.
    value: Math.min(
      5,
      Math.max(1, (sleepOf.get(shift(day, -1)) as number) - 4),
    ),
  }));
  return [
    {
      key: 'diary.mood',
      module: 'diary',
      labelKey: 'diary.mood',
      unit: 'score',
      days: mood,
    },
    {
      key: 'health.sleep',
      module: 'health',
      labelKey: 'health.sleep',
      unit: 'hours',
      days: sleep,
    },
    {
      key: 'health.steps',
      module: 'health',
      labelKey: 'health.steps',
      unit: 'count',
      days: steps,
    },
  ] as DailyMetric[];
}

describe('the mood forecast', () => {
  it('fits a ridge regression that finds the real driver', () => {
    const rows = [...Array(60).keys()].map(i => [i % 10, (i * 3) % 7]);
    const model = fit(
      rows,
      rows.map(([a]) => 2 * a + 1),
    );
    expect(model.predict([5, 3])).toBeCloseTo(11, 0);
    expect(Math.abs(model.weights[0])).toBeGreaterThan(
      Math.abs(model.weights[1]),
    );
  });

  it('forecasts today from yesterday, beats "like the last week", and names sleep', () => {
    const metrics = life(200);
    const target = shift('2026-01-01', 199) as LocalDate;
    const forecast = moodForecast(metrics, target);
    expect(forecast.days).toBeGreaterThan(150);
    expect(forecast.trusted).toBe(true);
    expect(forecast.error!).toBeLessThan(forecast.baselineError!);
    expect(forecast.drivers[0].key).toBe('health.sleep');
    expect(forecast.drivers[0].effect).toBeGreaterThan(0);
    expect(forecast.mood).toBeGreaterThanOrEqual(1);
  });

  it('says nothing without enough days of mood', () => {
    const forecast = moodForecast(life(MIN_DAYS - 5), '2026-02-01');
    expect(forecast.mood).toBeNull();
    expect(forecast.trusted).toBe(false);
  });
});
