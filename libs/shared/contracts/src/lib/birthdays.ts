import { z } from 'zod';
import { LocalDate } from './local-date';

export const REMINDER_DAY_OPTIONS = [0, 1, 3, 7, 14, 30] as const;

export const birthdayInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    /** The birth year is optional: without it the age is simply not shown. */
    year: z.number().int().min(1900).max(2100).nullish(),
    note: z.string().max(1000).nullish(),
    /** How many days in advance to remind: 0 — on the birthday itself. */
    remindDaysBefore: z.array(z.number().int().min(0).max(365)).max(10).default([0, 1, 7]),
  })
  .refine(({ month, day }) => day <= maxDayInMonth(month), {
    message: 'Invalid day for this month',
    path: ['day'],
  });
export type BirthdayInput = z.input<typeof birthdayInputSchema>;

export interface Birthday {
  id: string;
  name: string;
  month: number;
  day: number;
  year: number | null;
  note: string | null;
  remindDaysBefore: number[];
}

export interface UpcomingBirthday extends Birthday {
  nextDate: LocalDate;
  daysUntil: number;
  /** The age they are turning; `null` if the birth year is unknown. */
  turningAge: number | null;
}

/** February 29 is allowed: in non-leap years it is celebrated on the 28th. */
function maxDayInMonth(month: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
