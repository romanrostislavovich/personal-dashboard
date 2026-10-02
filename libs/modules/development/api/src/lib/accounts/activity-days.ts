import { LocalDate, todayIn, toLocalDate } from '@pd/contracts';
import { ActivityEvent } from './account-source';

/** A day of the calendar with what it was made of. */
export interface ActivityDay {
  day: LocalDate;
  count: number;
  commits: number;
  pullRequests: number;
  reviews: number;
  issues: number;
}

/** Events put into the days of the given time zone, oldest day first. */
export function activityDays(events: ActivityEvent[], timeZone: string): ActivityDay[] {
  const days = new Map<LocalDate, ActivityDay>();
  for (const event of events) {
    const day = toLocalDate(todayIn(timeZone, event.at));
    const row = days.get(day) ?? {
      day,
      count: 0,
      commits: 0,
      pullRequests: 0,
      reviews: 0,
      issues: 0,
    };
    row.count += event.contributions;
    switch (event.kind) {
      case 'commit':
        row.commits += event.amount;
        break;
      case 'pullRequest':
        row.pullRequests += event.amount;
        break;
      case 'review':
        row.reviews += event.amount;
        break;
      case 'issue':
        row.issues += event.amount;
        break;
    }
    days.set(day, row);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}
