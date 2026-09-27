import { daysInMonth, LocalDate, toLocalDate } from '@pd/contracts';

export interface Month {
  year: number;
  /** 1–12 */
  month: number;
}

export function currentMonth(now = new Date()): Month {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function shiftMonth({ year, month }: Month, delta: number): Month {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** First and last day of the month — for the transactions filter. */
export function monthRange({ year, month }: Month): { from: LocalDate; to: LocalDate } {
  return {
    from: toLocalDate({ year, month, day: 1 }),
    to: toLocalDate({ year, month, day: daysInMonth(year, month) }),
  };
}

/** A date for `DatePipe`: the middle of the month, so it does not depend on the time zone. */
export function monthAsDate({ year, month }: Month): Date {
  return new Date(year, month - 1, 15);
}

export function todayLocalDate(now = new Date()): LocalDate {
  return toLocalDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}
