import {DailyMetric, LocalDate} from '@pd/contracts';
import {daysOf, shift} from './daily-series';
import {unusualOn} from './unusual';

// A Friday: the weekdays and weekends before it are known.
const DAY = '2026-11-06';
const before = daysOf({from: shift(DAY, -56), to: shift(DAY, -1)});
const isWeekend = (day: LocalDate) =>
  [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());

function metric(
  key: string,
  value: (day: LocalDate, index: number) => number | undefined,
  today: number | undefined,
  more: Partial<DailyMetric> = {},
): DailyMetric {
  const days = before.flatMap((day, index) => {
    const one = value(day, index);
    return one === undefined ? [] : [{day, value: one}];
  });
  return {
    key,
    module: key.split('.')[0],
    labelKey: key,
    unit: 'count',
    days: today === undefined ? days : [...days, {day: DAY, value: today}],
    ...more,
  };
}

/** 10…19 again and again: a spread to be beyond. */
const usual = (_: LocalDate, index: number) => 10 + (index % 10);

describe('unusualOn', () => {
  it('finds a number beyond 9 of 10 usual days, and says by how much', () => {
    const {numbers} = unusualOn(
      [
        metric('activity.notifications', usual, 40),
        metric('activity.unlocks', usual, 15),
      ],
      DAY,
      true,
    );
    expect(numbers).toEqual([
      expect.objectContaining({
        key: 'activity.notifications',
        direction: 'up',
        beyond: 1,
        days: 28,
        baseline: 'days',
        usual: 14,
      }),
    ]);
  });

  it('calls a day not over unusual only upwards: its sums can still grow', () => {
    const low = [metric('activity.steps', usual, 1)];
    expect(unusualOn(low, DAY, false).numbers).toEqual([]);
    expect(unusualOn(low, DAY, true).numbers[0]).toMatchObject({
      direction: 'down',
    });
  });

  it('compares a number that differs on weekends with the same kind of day', () => {
    // Games: 1 on weekdays, 6 on weekends. A Friday of 4 is far from the weekdays.
    const games = metric(
      'activity.games',
      day => (isWeekend(day) ? 6 : 1 + (day.endsWith('1') ? 0.5 : 0)),
      4,
    );
    const [found] = unusualOn([games], DAY, true).numbers;
    expect(found).toMatchObject({baseline: 'kind', direction: 'up', days: 40});
  });

  it('does not call a value seen on one day of ten unusual', () => {
    // A tag used every tenth day: today again.
    const tag = metric(
      'diary.tag.run',
      (_, index) => (index % 10 === 0 ? 1 : 0),
      1,
    );
    expect(unusualOn([tag], DAY, true).numbers).toEqual([]);
  });

  it('says nothing of a number of too few days or without today', () => {
    const fresh = metric(
      'health.steps',
      (_, index) => (index > 50 ? 1 : undefined),
      1000,
    );
    const notYet = metric('activity.notifications', usual, undefined);
    expect(unusualOn([fresh, notYet], DAY, true).numbers).toEqual([]);
  });
});
