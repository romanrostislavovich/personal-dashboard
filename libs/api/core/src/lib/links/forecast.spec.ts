import {DailyMetric, LocalDate} from '@pd/contracts';
import {daysOf, shift} from './daily-series';
import {bedtimeMetric, fit, forecast, MIN_DAYS} from './forecast';

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

describe('the forecasts', () => {
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

  it('forecasts the day from the day before, beats the plain guess, and names sleep', () => {
    const metrics = life(200);
    const day = shift('2026-01-01', 199) as LocalDate;
    const result = forecast(metrics, metrics[0], day, 'morning');
    expect(result.days).toBeGreaterThan(150);
    expect(result.trusted).toBe(true);
    expect(result.error!).toBeLessThan(result.baselineError!);
    expect(result.baseline).not.toBeNull();
    expect(result.drivers.map(driver => driver.key)).toContain('health.sleep');
    expect(result.drivers.some(driver => driver.key === 'diary.mood')).toBe(
      false,
    );
    // Never beyond what the mood has ever been.
    expect(result.value!).toBeGreaterThanOrEqual(1);
    expect(result.value!).toBeLessThanOrEqual(5);
  });

  it('in the evening forecasts from yesterday: the day not over changes nothing', () => {
    const metrics = life(200);
    const today = shift('2026-01-01', 199) as LocalDate;
    const tomorrow = shift(today, 1);
    const evening = forecast(metrics, metrics[0], tomorrow, 'evening');
    expect(evening.made).toBe('evening');
    expect(evening.value).not.toBeNull();
    // Today's sleep and mood so far, whatever they are, do not move tomorrow's forecast.
    const changed = metrics.map(metric => ({
      ...metric,
      days: metric.days.map(one =>
        one.day === today ? {...one, value: one.value * 3} : one,
      ),
    }));
    expect(forecast(changed, changed[0], tomorrow, 'evening').value).toBe(
      evening.value,
    );
    expect(
      evening.drivers.every(driver => driver.key !== 'self.yesterday'),
    ).toBe(true);
  });

  it('says nothing without enough days of the number', () => {
    const metrics = life(MIN_DAYS - 5);
    const result = forecast(metrics, metrics[0], '2026-02-01', 'morning');
    expect(result.value).toBeNull();
    expect(result.trusted).toBe(false);
  });

  it("makes the bedtime of the band's nights and the phone's evenings", () => {
    const metric = (key: string, days: [string, number][]): DailyMetric => ({
      key,
      module: key.split('.')[0],
      labelKey: key,
      unit: 'clock',
      extra: true,
      days: days.map(([day, value]) => ({day, value})),
    });
    const bedtime = bedtimeMetric([
      metric('activity.phone.lastUse', [
        ['2026-03-01', 23.5],
        ['2026-03-02', 24.5],
      ]),
      metric('health.band.bedtime', [['2026-03-02', 24]]),
    ]);
    expect(bedtime?.key).toBe('links.bedtime');
    expect(bedtime?.extra).toBeUndefined();
    expect(bedtime?.days).toEqual([
      {day: '2026-03-01', value: 23.5},
      {day: '2026-03-02', value: 24},
    ]);
    expect(bedtimeMetric([])).toBeNull();
  });
});
