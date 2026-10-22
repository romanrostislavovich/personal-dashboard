import { HabitDay, habitInputSchema, habitStats } from './habits';

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

describe('the numbers of a habit to build', () => {
  const done = (...days: string[]): HabitDay[] =>
    days.map((day) => ({ day, status: 'done', amount: null }));

  it('every day: days in a row done; today not done yet keeps the run', () => {
    const habit = { goal: 'daily' as const, maxDaysPerWeek: null, startedOn: '2026-10-01' };
    const marks = done('2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07');
    expect(habitStats(habit, marks, '2026-10-08')).toMatchObject({
      currentStreak: 3,
      bestStreak: 3,
      doneDays: 5,
    });
    // A whole day missed (the 8th) breaks it the day after.
    expect(habitStats(habit, marks, '2026-10-09').currentStreak).toBe(0);
  });

  it('a few days a week: weeks in a row with enough of them', () => {
    const habit = {
      goal: 'weekly' as const,
      maxDaysPerWeek: null,
      timesPerWeek: 2,
      startedOn: '2026-09-28',
    };
    // Weeks from Monday: 09-28 (2 — yes), 10-05 (1 — no), 10-12 (2 — yes); this week 10-19: 1.
    const marks = done(
      '2026-09-29',
      '2026-10-01',
      '2026-10-06',
      '2026-10-13',
      '2026-10-15',
      '2026-10-20',
    );
    expect(habitStats(habit, marks, '2026-10-21')).toMatchObject({
      currentStreak: 1,
      bestStreak: 1,
      doneThisWeek: 1,
      doneDays: 6,
    });
  });
});

describe('the kinds of a habit', () => {
  const start = { startedOn: '2026-10-01' };

  it('builds the gym, never quits it', () => {
    expect(
      habitInputSchema.safeParse({ ...start, kind: 'gym', goal: 'weekly', timesPerWeek: 3 })
        .success,
    ).toBe(true);
    expect(habitInputSchema.safeParse({ ...start, kind: 'gym', goal: 'quit' }).success).toBe(false);
  });

  it('quits alcohol, never builds it', () => {
    expect(habitInputSchema.safeParse({ ...start, kind: 'alcohol', goal: 'quit' }).success).toBe(
      true,
    );
    expect(habitInputSchema.safeParse({ ...start, kind: 'alcohol', goal: 'daily' }).success).toBe(
      false,
    );
  });
});
