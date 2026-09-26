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

/** Первый и последний день месяца — для фильтра операций. */
export function monthRange({ year, month }: Month): { from: LocalDate; to: LocalDate } {
  return {
    from: toLocalDate({ year, month, day: 1 }),
    to: toLocalDate({ year, month, day: daysInMonth(year, month) }),
  };
}

/** Дата для `DatePipe`: середина месяца, чтобы не зависеть от часового пояса. */
export function monthAsDate({ year, month }: Month): Date {
  return new Date(year, month - 1, 15);
}

export function todayLocalDate(now = new Date()): LocalDate {
  return toLocalDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}
