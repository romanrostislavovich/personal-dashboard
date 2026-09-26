/**
 * Календарная дата без времени и часового пояса в формате `YYYY-MM-DD`.
 * Используется везде, где важен именно «день» (дни рождения, дата операции),
 * чтобы не ловить сдвиги из-за часовых поясов.
 */
export type LocalDate = string;

export interface DateParts {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
}

export function toLocalDate({ year, month, day }: DateParts): LocalDate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseLocalDate(value: LocalDate): DateParts {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

/** Сегодняшняя дата в указанном часовом поясе (например, `Europe/Warsaw`). */
export function todayIn(timeZone: string, now: Date = new Date()): DateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Дата на `days` дней позже (или раньше при отрицательном значении). */
export function addDays({ year, month, day }: DateParts, days: number): DateParts {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** Количество дней между двумя датами (b − a). */
export function daysBetween(a: DateParts, b: DateParts): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((toUtc(b) - toUtc(a)) / msPerDay);
}

function toUtc({ year, month, day }: DateParts): number {
  return Date.UTC(year, month - 1, day);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
