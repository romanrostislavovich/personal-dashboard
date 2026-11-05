import {taskDayNumbers} from './tasks-metrics';

const period = {from: '2026-11-01', to: '2026-11-03'};
const valueOn = (days: {day: string; value: number}[], day: string) =>
  days.find(one => one.day === day)?.value;

describe('taskDayNumbers', () => {
  const numbers = taskDayNumbers(
    [
      // Undated, open since the first day.
      {created: '2026-11-01', done: null, due: null, priority: 0},
      // Due on the 1st and done on the 3rd: overdue on the 2nd.
      {
        created: '2026-11-01',
        done: '2026-11-03',
        due: '2026-11-01',
        priority: 3,
      },
      // Due and done on the 2nd.
      {
        created: '2026-11-02',
        done: '2026-11-02',
        due: '2026-11-02',
        priority: 1,
      },
    ],
    period,
  );

  it('counts the open loops: undated, and past their date', () => {
    expect(valueOn(numbers.openLoops, '2026-11-01')).toBe(1);
    expect(valueOn(numbers.openLoops, '2026-11-02')).toBe(2);
    expect(valueOn(numbers.overdue, '2026-11-02')).toBe(1);
    expect(valueOn(numbers.openLoops, '2026-11-03')).toBe(1);
  });

  it('gives the share of what was due that got done, only on days something was due', () => {
    expect(valueOn(numbers.dueDone, '2026-11-01')).toBe(0);
    expect(valueOn(numbers.dueDone, '2026-11-02')).toBe(100);
    expect(valueOn(numbers.dueDone, '2026-11-03')).toBeUndefined();
  });

  it('counts the highest-priority tasks done', () => {
    expect(valueOn(numbers.importantDone, '2026-11-03')).toBe(1);
    expect(valueOn(numbers.importantDone, '2026-11-02')).toBe(0);
  });

  it('starts on the day of the first task', () => {
    const late = taskDayNumbers(
      [{created: '2026-11-03', done: null, due: null, priority: 0}],
      period,
    );
    expect(late.openLoops).toEqual([{day: '2026-11-03', value: 1}]);
  });
});
