import { z } from 'zod';
import { addDays, LocalDate, parseLocalDate, toLocalDate } from './local-date';

/*
 * Habits to quit or to cut down: alcohol, smoking, anything of one's own. A habit counts from
 * the day it is started ("I quit drinking today"); every day after it is clean unless it is
 * marked as a day with it — by the button on the page, an answer to the evening question in
 * Telegram, or the assistant. So nothing has to be marked every day.
 */

export const HABIT_KINDS = ['alcohol', 'smoking', 'custom'] as const;
export type HabitKind = (typeof HABIT_KINDS)[number];

/** `quit` — not at all; `less` — at most `maxDaysPerWeek` days a week. */
export const HABIT_GOALS = ['quit', 'less'] as const;
export type HabitGoal = (typeof HABIT_GOALS)[number];

export const HABIT_DAY_STATUSES = ['clean', 'used'] as const;
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
  /** Clean days in a row up to today (today counts unless it is a day with it). */
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
}

export interface Habit {
  id: string;
  kind: HabitKind;
  name: string | null;
  goal: HabitGoal;
  maxDaysPerWeek: number | null;
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
  habit: { startedOn: LocalDate; goal: HabitGoal; maxDaysPerWeek: number | null },
  marks: readonly HabitDay[],
  today: LocalDate,
): HabitStats {
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
  };
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
