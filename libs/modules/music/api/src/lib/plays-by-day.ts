import { addDays, DateParts, LocalDate, toLocalDate } from '@pd/contracts';

/**
 * A "plays per day" series for the last `days` days, including today.
 * Days without plays are included with zero — otherwise the chart lies.
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
