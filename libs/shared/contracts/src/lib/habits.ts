import { z } from 'zod';
import { addDays, LocalDate, parseLocalDate, toLocalDate } from './local-date';

/*
 * Habits to quit or to cut down — alcohol, smoking, anything of one's own — and habits to build
 * (sport, reading, a walk).
 *
 * One to quit counts from the day it is started ("I quit drinking today"); every day after it
 * is clean unless it is marked as a day with it — by the button on the page, an answer to the
 * evening question in Telegram, or the assistant. So nothing has to be marked every day.
 *
 * One to build is the other way round: a day counts only when it is marked as done.
 */

export const HABIT_KINDS = ['alcohol', 'smoking', 'custom'] as const;
export type HabitKind = (typeof HABIT_KINDS)[number];

/**
 * To quit: `quit` — not at all; `less` — at most `maxDaysPerWeek` days a week.
 * To build: `daily` — every day; `weekly` — `timesPerWeek` days a week.
 */
export const HABIT_GOALS = ['quit', 'less', 'daily', 'weekly'] as const;
export type HabitGoal = (typeof HABIT_GOALS)[number];

/** A habit to build (`daily`, `weekly`), not one to quit. */
export function isBuilding(goal: HabitGoal): boolean {
  return goal === 'daily' || goal === 'weekly';
}

/** `clean` / `used` — a day of a habit to quit; `done` — a day of one to build. */
export const HABIT_DAY_STATUSES = ['clean', 'used', 'done'] as const;
export type HabitDayStatus = (typeof HABIT_DAY_STATUSES)[number];

/** How many days of marks the page gets for its calendar. */
export const HABIT_CALENDAR_DAYS = 84;

const day = z.iso.date();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

export const habitInputSchema = z
  .object({
    kind: z.enum(HABIT_KINDS),
    /** A habit of one's own needs a name; alcohol and smoking are named by the page. */
    name: optionalText(100),
    goal: z.enum(HABIT_GOALS),
    /** For `less`: at most this many days a week with it. */
    maxDaysPerWeek: z.number().int().min(0).max(6).nullish(),
    /** For `weekly`: this many days a week. */
    timesPerWeek: z.number().int().min(1).max(7).nullish(),
    /** What a day with it can be counted in (`glasses`, `cigarettes`); `null` — not counted. */
    unit: optionalText(30),
    startedOn: day,
    /** The evening question in Telegram, `HH:mm` on the user's clock; `null` — none. */
    askAt: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm')
      .nullish(),
  })
  .refine((habit) => habit.kind !== 'custom' || !!habit.name, {
    message: 'A habit of your own needs a name',
    path: ['name'],
  })
  .refine((habit) => !isBuilding(habit.goal) || habit.kind === 'custom', {
    message: 'Alcohol and smoking are quit, not built',
    path: ['goal'],
  })
  .refine((habit) => habit.goal !== 'weekly' || habit.timesPerWeek != null, {
    message: 'How many days a week',
    path: ['timesPerWeek'],
  })
  .refine((habit) => habit.goal !== 'less' || habit.maxDaysPerWeek != null, {
    message: 'How many days a week at most',
    path: ['maxDaysPerWeek'],
  });
export type HabitInput = z.input<typeof habitInputSchema>;
export type ValidHabitInput = z.output<typeof habitInputSchema>;

/** `PUT /api/habits/:id/days/:day`: the day with it or clean, and how much (for a unit). */
export const habitDayInputSchema = z.object({
  status: z.enum(HABIT_DAY_STATUSES),
  amount: z.number().min(0).max(10_000).nullish(),
});
export type HabitDayInput = z.infer<typeof habitDayInputSchema>;

export interface HabitDay {
  day: LocalDate;
  status: HabitDayStatus;
  amount: number | null;
}

export interface HabitStats {
  /**
   * To quit: clean days in a row up to today (today counts unless it is a day with it). To
   * build: days in a row done (`daily`; today not done yet does not break it) or weeks in a row
   * on target (`weekly`).
   */
  currentStreak: number;
  bestStreak: number;
  /** Since the start. */
  cleanDays: number;
  usedDays: number;
  /** Clean days of this calendar year. */
  cleanDaysThisYear: number;
  /** Days with it this week (Monday to today). */
  usedThisWeek: number;
  /** For `less`: finished weeks in a row, the last one first, within `maxDaysPerWeek`. */
  weeksWithinLimit: number;
  /** To build: the days done since the start, and this week. */
  doneDays: number;
  doneThisWeek: number;
}

export interface Habit {
  id: string;
  kind: HabitKind;
  name: string | null;
  goal: HabitGoal;
  maxDaysPerWeek: number | null;
  timesPerWeek: number | null;
  unit: string | null;
  startedOn: LocalDate;
  askAt: string | null;
  stats: HabitStats;
  /** The marks of the last HABIT_CALENDAR_DAYS days, for the calendar. */
  recent: HabitDay[];
}

/**
 * The numbers of a habit from its start and its marked days. A day with no mark is clean; a day
 * before the start does not count.
 */
export function habitStats(
  habit: {
    startedOn: LocalDate;
    goal: HabitGoal;
    maxDaysPerWeek: number | null;
    timesPerWeek?: number | null;
  },
  marks: readonly HabitDay[],
  today: LocalDate,
): HabitStats {
  if (isBuilding(habit.goal)) {
    return buildingStats(habit, marks, today);
  }
  const used = new Set(marks.filter((mark) => mark.status === 'used').map((mark) => mark.day));
  const days = daysFrom(habit.startedOn, today);
  let run = 0;
  let best = 0;
  let cleanDays = 0;
  let cleanDaysThisYear = 0;
  for (const current of days) {
    if (used.has(current)) {
      run = 0;
      continue;
    }
    run++;
    cleanDays++;
    best = Math.max(best, run);
    if (current.slice(0, 4) === today.slice(0, 4)) {
      cleanDaysThisYear++;
    }
  }
  const weekStart = mondayOf(today);
  return {
    currentStreak: run,
    bestStreak: best,
    cleanDays,
    usedDays: days.length - cleanDays,
    cleanDaysThisYear,
    usedThisWeek: days.filter((current) => current >= weekStart && used.has(current)).length,
    weeksWithinLimit:
      habit.goal === 'less' && habit.maxDaysPerWeek != null
        ? weeksWithin(habit.startedOn, weekStart, used, habit.maxDaysPerWeek)
        : 0,
    doneDays: 0,
    doneThisWeek: 0,
  };
}

/**
 * A habit to build: only the days marked done count. Every day — the days done in a row (today
 * not done yet keeps yesterday's run); a few days a week — the weeks in a row with enough of
 * them (this week counts once it has them).
 */
function buildingStats(
  habit: { startedOn: LocalDate; goal: HabitGoal; timesPerWeek?: number | null },
  marks: readonly HabitDay[],
  today: LocalDate,
): HabitStats {
  const done = new Set(
    marks
      .filter((mark) => mark.status === 'done' && mark.day >= habit.startedOn && mark.day <= today)
      .map((mark) => mark.day),
  );
  const weekStart = mondayOf(today);
  const doneThisWeek = [...done].filter((d) => d >= weekStart).length;
  let current: number;
  let best: number;
  if (habit.goal === 'weekly') {
    const target = habit.timesPerWeek ?? 1;
    const weeks: boolean[] = [];
    for (let monday = mondayOf(habit.startedOn); monday <= weekStart; monday = shift(monday, 7)) {
      const count = Array.from({ length: 7 }, (_, i) => shift(monday, i)).filter((d) =>
        done.has(d),
      ).length;
      weeks.push(count >= target);
    }
    // This week only adds once it is on target; until then it is still going.
    if (weeks.length && !weeks[weeks.length - 1]) {
      weeks.pop();
    }
    ({ current, best } = runs(weeks));
  } else {
    const days = daysFrom(habit.startedOn, today).map((d) => done.has(d));
    if (days.length && !days[days.length - 1]) {
      days.pop();
    }
    ({ current, best } = runs(days));
  }
  return {
    currentStreak: current,
    bestStreak: best,
    cleanDays: 0,
    usedDays: 0,
    cleanDaysThisYear: [...done].filter((d) => d.slice(0, 4) === today.slice(0, 4)).length,
    usedThisWeek: 0,
    weeksWithinLimit: 0,
    doneDays: done.size,
    doneThisWeek,
  };
}

/** The run at the end and the longest one, of a row of yes and no. */
function runs(row: boolean[]): { current: number; best: number } {
  let current = 0;
  let best = 0;
  for (const yes of row) {
    current = yes ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return { current, best };
}

/** The finished weeks before `weekStart`, the last first, within the limit — from the start on. */
function weeksWithin(
  startedOn: LocalDate,
  weekStart: LocalDate,
  used: ReadonlySet<LocalDate>,
  limit: number,
): number {
  let weeks = 0;
  for (
    let monday = shift(weekStart, -7);
    monday >= mondayOf(startedOn);
    monday = shift(monday, -7)
  ) {
    const usedDays = Array.from({ length: 7 }, (_, index) => shift(monday, index)).filter((d) =>
      used.has(d),
    ).length;
    if (usedDays > limit) {
      break;
    }
    weeks++;
  }
  return weeks;
}

/** Every day from `from` to `to`, both included; none when `from` is later. */
function daysFrom(from: LocalDate, to: LocalDate): LocalDate[] {
  const days: LocalDate[] = [];
  for (let current = from; current <= to; current = shift(current, 1)) {
    days.push(current);
  }
  return days;
}

function shift(date: LocalDate, days: number): LocalDate {
  return toLocalDate(addDays(parseLocalDate(date), days));
}

function mondayOf(date: LocalDate): LocalDate {
  const { year, month, day: dayOfMonth } = parseLocalDate(date);
  const weekday = (new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay() + 6) % 7;
  return shift(date, -weekday);
}
