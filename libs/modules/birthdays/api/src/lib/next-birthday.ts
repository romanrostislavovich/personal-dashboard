import { DateParts, daysBetween, isLeapYear, toLocalDate } from '@pd/contracts';

export interface NextBirthday {
  nextDate: string;
  daysUntil: number;
  turningAge: number | null;
}

/**
 * Ближайший день рождения начиная с `today` (сегодняшний тоже считается).
 * Родившиеся 29 февраля в невисокосный год празднуют 28-го.
 */
export function nextBirthday(
  birthday: { month: number; day: number; year: number | null },
  today: DateParts,
): NextBirthday {
  let next = occurrenceIn(today.year, birthday);
  if (daysBetween(today, next) < 0) {
    next = occurrenceIn(today.year + 1, birthday);
  }
  return {
    nextDate: toLocalDate(next),
    daysUntil: daysBetween(today, next),
    turningAge: birthday.year ? next.year - birthday.year : null,
  };
}

function occurrenceIn(year: number, { month, day }: { month: number; day: number }): DateParts {
  const isFeb29 = month === 2 && day === 29;
  return { year, month, day: isFeb29 && !isLeapYear(year) ? 28 : day };
}
