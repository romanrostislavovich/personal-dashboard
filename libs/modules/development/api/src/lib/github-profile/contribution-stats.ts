import {
  addDays,
  computeStreaks,
  DateParts,
  GithubContributionDay,
  toLocalDate,
} from '@pd/contracts';

export interface ContributionStats {
  today: number;
  /** The last 7 days, today included. */
  week: number;
  streak: { current: number; longest: number };
  busiestDay: GithubContributionDay | null;
}

/** Today, the week, the streaks and the record day from the saved calendar. */
export function contributionStats(
  days: GithubContributionDay[],
  today: DateParts,
): ContributionStats {
  const active = days.filter((day) => day.count > 0);
  const weekStart = toLocalDate(addDays(today, -6));
  const todayDate = toLocalDate(today);
  return {
    today: active.find((day) => day.day === todayDate)?.count ?? 0,
    week: active
      .filter((day) => day.day >= weekStart && day.day <= todayDate)
      .reduce((sum, day) => sum + day.count, 0),
    streak: computeStreaks(
      active.map((day) => day.day),
      today,
    ),
    // The earliest of equal days: a record stays with the day that set it.
    busiestDay: active.reduce<GithubContributionDay | null>(
      (best, day) => (!best || day.count > best.count ? day : best),
      null,
    ),
  };
}

/**
 * Years whose calendar has to be fetched: the ones not saved yet (the whole history on the first
 * sync) plus the current and the previous one — contributions are counted in GitHub's time zone
 * and backdated commits land in days that are already over.
 */
export function yearsToSync(joinedYear: number, currentYear: number, saved: number[]): number[] {
  const years: number[] = [];
  for (let year = joinedYear; year <= currentYear; year++) {
    if (year >= currentYear - 1 || !saved.includes(year)) {
      years.push(year);
    }
  }
  return years;
}
