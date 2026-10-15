import { HabitDay, habitStats } from './habits';

const used = (...days: string[]): HabitDay[] =>
  days.map((day) => ({ day, status: 'used', amount: null }));

describe('the numbers of a habit', () => {
  const quit = { goal: 'quit' as const, maxDaysPerWeek: null };

  it('counts every day since the start as clean, today included', () => {
    const stats = habitStats({ ...quit, startedOn: '2026-10-01' }, [], '2026-10-15');
    expect(stats).toMatchObject({ currentStreak: 15, bestStreak: 15, cleanDays: 15, usedDays: 0 });
    expect(habitStats({ ...quit, startedOn: '2026-10-15' }, [], '2026-10-15').currentStreak).toBe(
      1,
    );
  });

  it('starts the run again after a day with it, and keeps the best one', () => {
    const stats = habitStats(
      { ...quit, startedOn: '2026-10-01' },
      used('2026-10-11'),
      '2026-10-15',
    );
    expect(stats).toMatchObject({ currentStreak: 4, bestStreak: 10, cleanDays: 14, usedDays: 1 });
    expect(
      habitStats({ ...quit, startedOn: '2026-10-01' }, used('2026-10-15'), '2026-10-15')
        .currentStreak,
    ).toBe(0);
  });

  it('ignores marks before the start and an explicit clean mark changes nothing', () => {
    const marks: HabitDay[] = [
      ...used('2026-09-20'),
      { day: '2026-10-02', status: 'clean', amount: null },
    ];
    expect(habitStats({ ...quit, startedOn: '2026-10-01' }, marks, '2026-10-03').cleanDays).toBe(3);
  });

  it('counts the clean days of this year only', () => {
    const stats = habitStats({ ...quit, startedOn: '2025-12-30' }, [], '2026-01-02');
    expect(stats.cleanDays).toBe(4);
    expect(stats.cleanDaysThisYear).toBe(2);
  });

  it('cutting down: finished weeks in a row within the limit, the last first', () => {
    const less = { goal: 'less' as const, maxDaysPerWeek: 2, startedOn: '2026-09-07' };
    // Weeks from Monday: 09-07 (3 days — over), 09-14 (2), 09-21 (1), 09-28 (0), 10-05 (2);
    // this week from 10-12: one day so far.
    const marks = used(
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-15',
      '2026-09-17',
      '2026-09-22',
      '2026-10-06',
      '2026-10-07',
      '2026-10-13',
    );
    const stats = habitStats(less, marks, '2026-10-15');
    expect(stats.weeksWithinLimit).toBe(4);
    expect(stats.usedThisWeek).toBe(1);
    expect(habitStats({ ...less, goal: 'quit' }, marks, '2026-10-15').weeksWithinLimit).toBe(0);
  });
});
