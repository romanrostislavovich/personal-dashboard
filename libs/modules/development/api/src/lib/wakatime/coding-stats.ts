import {
  addDays,
  computeStreaks,
  DateParts,
  daysBetween,
  LocalDate,
  toLocalDate,
  WakatimeDay,
  WakatimeShare,
} from '@pd/contracts';

/** How far back a regular sync reaches: a week is what any WakaTime plan gives. */
export const SYNC_WINDOW_DAYS = 7;

/** Every day from `from` to `to`, oldest first; days without coding are zeros. */
export function fillDays(days: WakatimeDay[], from: DateParts, to: DateParts): WakatimeDay[] {
  const seconds = new Map(days.map((day) => [day.day, day.seconds]));
  const filled: WakatimeDay[] = [];
  for (let i = 0; i <= daysBetween(from, to); i++) {
    const day = toLocalDate(addDays(from, i));
    filled.push({ day, seconds: seconds.get(day) ?? 0 });
  }
  return filled;
}

/** Totals of a period: the sum, the active days and their average, the best day. */
export function codingTotals(days: WakatimeDay[]) {
  const active = days.filter((day) => day.seconds > 0);
  const totalSeconds = active.reduce((sum, day) => sum + day.seconds, 0);
  return {
    totalSeconds,
    activeDays: active.length,
    dailyAverageSeconds: active.length ? Math.round(totalSeconds / active.length) : 0,
    // The earliest of equal days: a record stays with the day that set it.
    bestDay: active.reduce<WakatimeDay | null>(
      (best, day) => (!best || day.seconds > best.seconds ? day : best),
      null,
    ),
  };
}

/** The longest run of days in a row with coding. */
export function longestCodingStreak(days: WakatimeDay[], today: DateParts): number {
  return computeStreaks(
    days.filter((day) => day.seconds > 0).map((day) => day.day),
    today,
  ).longest;
}

/** Items summed by name, largest first: a project over the days of a period. */
export function sumShares(rows: WakatimeShare[], limit: number): WakatimeShare[] {
  const totals = new Map<string, number>();
  for (const { name, seconds } of rows) {
    totals.set(name, (totals.get(name) ?? 0) + seconds);
  }
  return [...totals]
    .map(([name, seconds]) => ({ name, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit);
}

/**
 * The first day a sync asks for: the last saved day (it may have been unfinished), but never
 * yesterday skipped and never further back than the window — an older gap cannot be filled.
 */
export function syncStart(lastSavedDay: LocalDate | null, today: DateParts): LocalDate {
  const oldest = toLocalDate(addDays(today, -(SYNC_WINDOW_DAYS - 1)));
  const yesterday = toLocalDate(addDays(today, -1));
  if (!lastSavedDay) {
    return oldest;
  }
  const from = lastSavedDay < yesterday ? lastSavedDay : yesterday;
  return from < oldest ? oldest : from;
}

/** Seconds as hours with two decimals — easier for the AI model than seconds. */
export function toHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}
