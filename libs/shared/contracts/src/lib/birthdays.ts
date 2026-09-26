import { z } from 'zod';
import { LocalDate } from './local-date';

export const REMINDER_DAY_OPTIONS = [0, 1, 3, 7, 14, 30] as const;

export const birthdayInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    /** Год рождения необязателен: без него просто не показываем возраст. */
    year: z.number().int().min(1900).max(2100).nullish(),
    note: z.string().max(1000).nullish(),
    /** За сколько дней напоминать: 0 — в сам день рождения. */
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
  /** Сколько исполнится; `null`, если год рождения неизвестен. */
  turningAge: number | null;
}

/** 29 февраля допустимо: в невисокосный год отмечаем 28-го. */
function maxDayInMonth(month: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
