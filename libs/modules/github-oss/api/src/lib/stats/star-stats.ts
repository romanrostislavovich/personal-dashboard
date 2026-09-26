import { DateParts, LocalDate, parseLocalDate, daysBetween } from '@pd/contracts';

const STAR_MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

/**
 * Максимальная «круглая» отметка, которую репозиторий перешёл между двумя замерами.
 * 48 → 103 звезды = 100 (про 50 отдельно не пишем — достаточно самой большой).
 */
export function crossedStarMilestone(previous: number, current: number): number | null {
  const crossed = STAR_MILESTONES.filter(
    (milestone) => previous < milestone && current >= milestone,
  );
  return crossed.length > 0 ? crossed[crossed.length - 1] : null;
}

/**
 * Прирост звёзд за последние `days` дней по дневной истории.
 * Если истории меньше, считаем от самой ранней точки.
 */
export function starsDelta(
  history: { day: LocalDate; stars: number }[],
  currentStars: number,
  today: DateParts,
  days: number,
): number {
  if (history.length === 0) {
    return 0;
  }
  const sorted = [...history].sort((a, b) => a.day.localeCompare(b.day));
  const baseline =
    [...sorted].reverse().find((point) => daysBetween(parseLocalDate(point.day), today) >= days) ??
    sorted[0];
  return currentStars - baseline.stars;
}
