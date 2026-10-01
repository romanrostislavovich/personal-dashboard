import { z } from 'zod';
import { addDays, daysInMonth, LocalDate, parseLocalDate, toLocalDate } from './local-date';

export const REPEAT_UNITS = ['day', 'week', 'month', 'year'] as const;
export type RepeatUnit = (typeof REPEAT_UNITS)[number];

/** "Every 2 weeks": how often a task or a reminder comes back. */
export const repeatSchema = z.object({
  every: z.number().int().min(1).max(365),
  unit: z.enum(REPEAT_UNITS),
});
export type Repeat = z.infer<typeof repeatSchema>;

/** The day one step of the rule after `date`. The 31st becomes the last day of a shorter month. */
export function addRepeat(date: LocalDate, { every, unit }: Repeat): LocalDate {
  const parts = parseLocalDate(date);
  if (unit === 'day' || unit === 'week') {
    return toLocalDate(addDays(parts, unit === 'day' ? every : every * 7));
  }
  const months = parts.year * 12 + (parts.month - 1) + (unit === 'month' ? every : every * 12);
  const year = Math.floor(months / 12);
  const month = (months % 12) + 1;
  return toLocalDate({ year, month, day: Math.min(parts.day, daysInMonth(year, month)) });
}

/**
 * The next day of a repeating thing: steps of the rule from `date` until past `after`.
 * Something overdue for a month comes back on its next day in the future, not a month of times.
 */
export function nextRepeat(date: LocalDate, rule: Repeat, after: LocalDate): LocalDate {
  let next = addRepeat(date, rule);
  while (next <= after) {
    next = addRepeat(next, rule);
  }
  return next;
}
