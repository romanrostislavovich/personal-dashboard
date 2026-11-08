import {ExperimentCondition} from '@pd/contracts';
import {experimentResult, makeSchedule, MIN_EACH, seeded} from './lab';

describe('the personal lab', () => {
  it('makes as many changed days as ordinary ones, on weekdays and weekends alike', () => {
    // 2026-11-09 is a Monday: four weeks, eight weekend days.
    const schedule = makeSchedule('2026-11-09', 28, seeded(3));
    expect(schedule).toHaveLength(28);
    const weekend = (day: string) =>
      [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
    const count = (inWeekend: boolean, condition: ExperimentCondition) =>
      schedule.filter(
        one => weekend(one.day) === inWeekend && one.condition === condition,
      ).length;
    expect(count(true, 'changed')).toBe(4);
    expect(count(true, 'ordinary')).toBe(4);
    expect(count(false, 'changed')).toBe(10);
    expect(count(false, 'ordinary')).toBe(10);
    // Random: not simply alternating.
    expect(
      makeSchedule('2026-11-09', 28, seeded(4)).map(one => one.condition),
    ).not.toEqual(schedule.map(one => one.condition));
  });

  it('describes the two kinds of days, the difference and how sure it is', () => {
    const days = [...Array(20).keys()].map(index => ({
      condition: (index % 2 ? 'changed' : 'ordinary') as ExperimentCondition,
      value: index % 2 ? 4 + (index % 3) / 10 : 3 + (index % 3) / 10,
      kept: true,
    }));
    const result = experimentResult(days);
    expect(result.enough).toBe(true);
    expect(result.difference).toBeCloseTo(1, 1);
    expect(result.interval?.[0]).toBeGreaterThan(0.5);
    expect(result.interval?.[1]).toBeLessThan(1.5);
    // The same days, the same interval on every look.
    expect(experimentResult(days).interval).toEqual(result.interval);
  });

  it('never turns a missed day into a zero, and leaves out a day not kept', () => {
    const result = experimentResult([
      {condition: 'changed', value: null, kept: null},
      {condition: 'changed', value: 1, kept: false},
      {condition: 'ordinary', value: 3, kept: true},
    ]);
    expect(result.missing).toBe(1);
    expect(result.notKept).toBe(1);
    expect(result.changed.n).toBe(0);
    expect(result.difference).toBeNull();
    expect(result.enough).toBe(false);
    expect(result.interval).toBeNull();
    expect(MIN_EACH).toBeGreaterThan(1);
  });
});
