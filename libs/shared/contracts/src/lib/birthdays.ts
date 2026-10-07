import { z } from 'zod';
import { LocalDate } from './local-date';

export const REMINDER_DAY_OPTIONS = [0, 1, 3, 7, 14, 30] as const;

/** A day of memory is told about on the day and the day before, unless set otherwise. */
export const MEMORIAL_REMINDER_DEFAULT = [0, 1];

const month = z.number().int().min(1).max(12);
const day = z.number().int().min(1).max(31);
const remindDays = z.array(z.number().int().min(0).max(365)).max(10);

/**
 * A person and the dates to remember: the birthday and — for someone who has died — the day of
 * memory. Either date may be missing (the birthday of a great-grandfather is not always known),
 * but not both.
 */
export const birthdayInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    /** The birthday: both or neither. */
    month: month.nullish(),
    day: day.nullish(),
    /** The birth year is optional: without it the age is simply not shown. */
    year: z.number().int().min(1800).max(2100).nullish(),
    note: z.string().max(1000).nullish(),
    /** How many days in advance to remind: 0 — on the birthday itself. */
    remindDaysBefore: remindDays.default([0, 1, 7]),
    /** The day the person died: both or neither; the year is optional. */
    deathMonth: month.nullish(),
    deathDay: day.nullish(),
    deathYear: z.number().int().min(1800).max(2100).nullish(),
    /** How many days in advance to remind of the day of memory: 0 — on the day itself. */
    memorialRemindDaysBefore: remindDays.default(MEMORIAL_REMINDER_DEFAULT),
  })
  .refine((input) => isWholeDate(input.month, input.day), {
    message: 'Invalid day for this month',
    path: ['day'],
  })
  .refine((input) => isWholeDate(input.deathMonth, input.deathDay), {
    message: 'Invalid day for this month',
    path: ['deathDay'],
  })
  .refine((input) => input.month != null || input.deathMonth != null, {
    message: 'A birthday or a day of death is needed',
    path: ['day'],
  });
export type BirthdayInput = z.input<typeof birthdayInputSchema>;

export interface Birthday {
  id: string;
  name: string;
  /** `null` — the birthday is not known (the person is kept for the day of memory). */
  month: number | null;
  day: number | null;
  year: number | null;
  note: string | null;
  remindDaysBefore: number[];
  /** The day the person died; `null` — alive. */
  deathMonth: number | null;
  deathDay: number | null;
  deathYear: number | null;
  memorialRemindDaysBefore: number[];
}

export interface UpcomingBirthday extends Birthday {
  /** The next birthday; `null` — the birthday is not known. */
  nextDate: LocalDate | null;
  daysUntil: number | null;
  /** The age they are turning — or would be turning; `null` if the birth year is unknown. */
  turningAge: number | null;
  /** The next day of memory; `null` — the person is alive. */
  memorial: {
    nextDate: LocalDate;
    daysUntil: number;
    /** Years since; `null` if the year is unknown. */
    years: number | null;
  } | null;
}

/** A date of a person that is coming: their birthday or their day of memory. */
export interface PersonDate {
  kind: 'birthday' | 'memorial';
  person: UpcomingBirthday;
  date: LocalDate;
  daysUntil: number;
  /** The age they are (or would be) turning, or the years since they died; `null` — unknown. */
  years: number | null;
}

/** Every coming date of the people, the nearest first: a person may have two. */
export function upcomingDates(people: UpcomingBirthday[]): PersonDate[] {
  const dates: PersonDate[] = [];
  for (const person of people) {
    if (person.nextDate !== null && person.daysUntil !== null) {
      dates.push({
        kind: 'birthday',
        person,
        date: person.nextDate,
        daysUntil: person.daysUntil,
        years: person.turningAge,
      });
    }
    if (person.memorial) {
      dates.push({
        kind: 'memorial',
        person,
        date: person.memorial.nextDate,
        daysUntil: person.memorial.daysUntil,
        years: person.memorial.years,
      });
    }
  }
  return dates.sort((a, b) => a.daysUntil - b.daysUntil);
}

/** Days until the nearest date of a person. */
export function daysUntilNearest(person: UpcomingBirthday): number {
  return Math.min(
    person.daysUntil ?? Number.POSITIVE_INFINITY,
    person.memorial?.daysUntil ?? Number.POSITIVE_INFINITY,
  );
}

/** A day and a month together or not at all, and a day the month has. */
function isWholeDate(monthOf: number | null | undefined, dayOf: number | null | undefined) {
  if (monthOf == null || dayOf == null) {
    return monthOf == null && dayOf == null;
  }
  return dayOf <= maxDayInMonth(monthOf);
}

/** February 29 is allowed: in non-leap years it is celebrated on the 28th. */
function maxDayInMonth(monthOf: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][monthOf - 1];
}
