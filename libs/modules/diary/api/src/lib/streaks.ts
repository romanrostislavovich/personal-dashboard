import { addDays, DateParts, LocalDate, toLocalDate } from '@pd/contracts';

/**
 * Серии дней подряд с записью.
 * Текущая серия не обрывается, если сегодня ещё не писал: считаем от вчера —
 * день ещё не закончился.
 */
export function computeStreaks(
  days: LocalDate[],
  today: DateParts,
): { current: number; longest: number } {
  const written = new Set(days);

  let current = 0;
  let cursor = written.has(toLocalDate(today)) ? today : addDays(today, -1);
  while (written.has(toLocalDate(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }

  // Самая длинная серия: идём по отсортированным датам и считаем соседние дни.
  let longest = 0;
  let run = 0;
  let previous: LocalDate | null = null;
  for (const day of [...written].sort()) {
    const isNextDay = previous !== null && nextDay(previous) === day;
    run = isNextDay ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  return { current, longest };
}

function nextDay(day: LocalDate): LocalDate {
  const [year, month, date] = day.split('-').map(Number);
  return toLocalDate(addDays({ year, month, day: date }, 1));
}
