import {DailyMetric} from '@pd/contracts';
import {daysOf} from './daily-series';
import {changePoints} from './change-points';

const period = {from: '2026-01-01', to: '2026-06-29'};
const days = daysOf(period);

/** The same "random" days every run. */
function noise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31 - 0.5;
  };
}

function metric(key: string, value: (index: number) => number): DailyMetric {
  return {
    key,
    module: key.split('.')[0],
    labelKey: key,
    unit: 'hours',
    days: days.map((day, index) => ({day, value: value(index)})),
  };
}

describe('changePoints', () => {
  it('finds the day a level changed, with the levels before and after', () => {
    const random = noise(11);
    // An hour of late phone until mid-March, then about two.
    const late = metric(
      'activity.phone.night',
      index => (index < 70 ? 1 : 2) + 0.6 * random(),
    );
    const [change] = changePoints([late], period);
    expect(change.key).toBe('activity.phone.night');
    expect(Math.abs(days.indexOf(change.day) - 70)).toBeLessThanOrEqual(3);
    expect(change.before).toBeCloseTo(1, 0);
    expect(change.after).toBeCloseTo(2, 0);
    expect(change.effect).toBeGreaterThan(1);
  });

  it('finds two changes when the level moves twice', () => {
    const random = noise(5);
    const steps = metric(
      'health.steps',
      index => (index < 60 ? 5 : index < 120 ? 9 : 4) + random(),
    );
    const found = changePoints([steps], period).map(change =>
      days.indexOf(change.day),
    );
    expect(found).toHaveLength(2);
    expect(found.sort((a, b) => a - b)[0]).toBeGreaterThan(55);
  });

  it('calls noise and a slow weekly rhythm no change', () => {
    const random = noise(3);
    const calm = metric(
      'development.coding',
      index => 4 + (index % 7 >= 5 ? -2 : 0) + 2 * random(),
    );
    expect(changePoints([calm], period)).toEqual([]);
  });

  it('calls the chance clusters of a rare yes/no number no change', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const random = noise(seed);
      const tag = metric('diary.tag.run', () => (random() > 0.375 ? 1 : 0));
      expect(changePoints([tag], period)).toEqual([]);
    }
  });

  it('takes weeks without a report for a gap, not for a fall to zero', () => {
    const random = noise(9);
    // Coding of about 4 h, but nothing reported for 25 days in the middle (the computer off).
    const coding: DailyMetric = {
      ...metric('development.coding', () => 4 + random()),
      unit: 'hours',
    };
    coding.days = coding.days.filter((_, index) => index < 80 || index >= 105);
    expect(changePoints([coding], period)).toEqual([]);
  });

  it('needs three weeks on each side', () => {
    const short = metric('diary.mood', index => (index < 10 ? 1 : 4));
    const [change] = changePoints([short], period);
    expect(change).toBeUndefined();
  });
});
