import { addDays, DateParts, LocalDate, toLocalDate } from '@pd/contracts';

/**
 * Ряд «прослушиваний по дням» за последние `days` дней, включая сегодня.
 * Дни без прослушиваний попадают в ряд с нулём — иначе график врёт.
 */
export function fillPlaysByDay(
  counts: { day: LocalDate; plays: number }[],
  today: DateParts,
  days: number,
): { day: LocalDate; plays: number }[] {
  const byDay = new Map(counts.map((c) => [c.day, c.plays]));
  return Array.from({ length: days }, (_, i) => {
    const day = toLocalDate(addDays(today, i - days + 1));
    return { day, plays: byDay.get(day) ?? 0 };
  });
}
