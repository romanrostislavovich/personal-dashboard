import {HourEvent, HourlyMetric, LocalDate} from '@pd/contracts';
import {daysOf} from '../daily-series';
import {hourAfter} from './hour-after';
import {hourOf, nextHour, weekdayOf} from './local-hours';
import {inWindow, productiveWindows} from './productive-window';
import {peaksOf, rhythmOf} from './rhythm';

const DAYS = daysOf({from: '2026-06-01', to: '2026-08-29'}) as LocalDate[];

/**
 * A made-up life: coding 10–12 and 21–23 on weekdays; on the evenings with a game at 20 the
 * coding at 21 falls to nothing.
 */
function life() {
  const gameDays = DAYS.filter((_, index) => index % 3 === 0);
  const coding: HourlyMetric = {
    key: 'development.hour.coding',
    module: 'development',
    labelKey: 'coding',
    unit: 'minutes',
    productive: true,
    days: DAYS,
    hours: DAYS.flatMap(day => {
      if (weekdayOf(day) > 4) {
        return [];
      }
      const game = gameDays.includes(day);
      return [10, 11, 21, 22].map(hour => ({
        hour: hourOf(day, hour),
        value: hour === 21 && game ? 2 : 50 + (hour % 3),
      }));
    }),
  };
  const steps: HourlyMetric = {
    key: 'health.hour.steps',
    module: 'health',
    labelKey: 'steps',
    unit: 'count',
    days: DAYS,
    hours: DAYS.map(day => ({hour: hourOf(day, 18), value: 3000})),
  };
  const game: HourEvent = {
    key: 'activity.event.game',
    module: 'activity',
    labelKey: 'game',
    days: DAYS,
    hours: gameDays.map(day => hourOf(day, 20)),
  };
  return {coding, steps, game};
}

describe('hours', () => {
  it('walks the hours across midnight', () => {
    expect(nextHour('2026-06-01T23')).toBe('2026-06-02T00');
    expect(weekdayOf('2026-06-01')).toBe(0);
  });

  it('finds the rhythm and its peaks', () => {
    const rhythm = rhythmOf(life().coding);
    expect(rhythm.days).toBe(DAYS.length);
    // A Saturday at 10 is a zero, not unknown: the day was seen.
    expect(rhythm.cells[5][10]).toBe(0);
    expect(rhythm.peaks).toEqual([
      {from: 10, to: 12},
      {from: 22, to: 23},
    ]);
    expect(peaksOf(Array(24).fill(0))).toEqual([]);
  });

  it('tells the hour after a game against the same hours without one', () => {
    const {coding, steps, game} = life();
    const results = hourAfter([coding, steps], [game]);
    const after = results.find(
      one => one.outcome === 'development.hour.coding',
    );
    expect(after?.strong).toBe(true);
    expect(after?.difference).toBeLessThan(-30);
    expect(after?.events).toBeGreaterThanOrEqual(8);
    // Steps at 21 do not change: nothing to tell.
    expect(
      results.find(one => one.outcome === 'health.hour.steps')?.strong ?? false,
    ).toBe(false);
  });

  it('leaves out the numbers that are the event itself', () => {
    const {coding, game} = life();
    expect(
      hourAfter([coding], [{...game, itself: ['development.hour.coding']}]),
    ).toEqual([]);
  });

  it('finds the productive window of a weekday, and none on a free day', () => {
    const week = productiveWindows([life().coding]);
    expect(week[0].windows).toEqual([
      {from: 10, to: 12},
      {from: 21, to: 23},
    ]);
    expect(week[0].sure).toBe('high');
    expect(week[6].windows).toEqual([]);
    expect(week[6].sure).toBe('low');
  });

  it('tells a day whose deep work went into its window', () => {
    const [monday] = productiveWindows([life().coding]);
    const hours = Array(24).fill(0);
    hours[10] = 40;
    hours[15] = 20;
    expect(inWindow(hours, monday)).toBe(true);
    hours[15] = 60;
    expect(inWindow(hours, monday)).toBe(false);
  });
});
