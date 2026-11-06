import {
  ACTIVITY_CATEGORIES,
  ActivityCategory,
  DailyMetric,
  defaultActivityCategory,
  LocalDate,
} from '@pd/contracts';

const HOUR = 3600;

/** The categories of phone time shown by default; the rest are extra (see DailyMetric.extra). */
const MAIN_CATEGORIES = new Set<ActivityCategory>([
  'communication',
  'media',
  'games',
  'browsing',
]);

/** What the phone gives for the day's numbers, read by PhoneUsageService. */
export interface PhoneDayRows {
  /** Seconds in each app a day. */
  apps: {day: LocalDate; app: string; seconds: number}[];
  /** Notifications of each app a day. */
  notifications: {day: LocalDate; app: string; count: number}[];
  /** The most notifications in one ten-minute stretch of the clock, a day. */
  busiest: {day: LocalDate; count: number}[];
  /** The days the phone reported at all (unlocks): no notification on them is a zero. */
  told: LocalDate[];
}

/**
 * The phone's base numbers of Links v2: its hours, and of them each category's (by the user's
 * own category of an app, else the known one); the notifications, the messengers' of them, and
 * the busiest ten minutes. A day the phone did not report is unknown, never a zero.
 */
export function phoneDayMetrics(
  rows: PhoneDayRows,
  chosen: Map<string, ActivityCategory | null>,
): DailyMetric[] {
  const categoryOf = (app: string) =>
    chosen.get(app) ?? defaultActivityCategory(app);
  const told = [...new Set(rows.told)].sort();
  const metric = (
    key: string,
    unit: DailyMetric['unit'],
    values: Map<LocalDate, number>,
    more: Partial<DailyMetric> = {},
  ): DailyMetric => ({
    key: `activity.phone.${key}`,
    module: 'activity',
    labelKey: `activity.links.phone.${key}`,
    unit,
    missing: 'absent',
    days: told.map(day => ({day, value: values.get(day) ?? 0})),
    ...more,
  });

  const hours = new Map<LocalDate, number>();
  const byCategory = new Map<ActivityCategory, Map<LocalDate, number>>();
  for (const {day, app, seconds} of rows.apps) {
    add(hours, day, seconds / HOUR);
    const category = categoryOf(app);
    const days = byCategory.get(category) ?? new Map<LocalDate, number>();
    byCategory.set(category, add(days, day, seconds / HOUR));
  }
  const notifications = new Map<LocalDate, number>();
  const messengers = new Map<LocalDate, number>();
  for (const {day, app, count} of rows.notifications) {
    add(notifications, day, count);
    if (categoryOf(app) === 'communication') {
      add(messengers, day, count);
    }
  }
  const busiest = new Map(rows.busiest.map(row => [row.day, row.count]));

  const metrics: DailyMetric[] = [];
  if (hours.size) {
    metrics.push(metric('hours', 'hours', rounded(hours)));
    for (const category of ACTIVITY_CATEGORIES) {
      const days = byCategory.get(category);
      if (days) {
        metrics.push(
          metric(`category.${category}`, 'hours', rounded(days), {
            labelKey: `activity.links.phone.category.${category}`,
            partOf: 'activity.phone.hours',
            // Video and music apps in front, and "something playing", are nearly one number.
            ...(category === 'media' ? {parts: ['activity.phone.media']} : {}),
            ...(MAIN_CATEGORIES.has(category) ? {} : {extra: true}),
          }),
        );
      }
    }
  }
  if (notifications.size) {
    metrics.push(
      metric('notifications', 'count', notifications),
      metric('messengerNotifications', 'count', messengers, {
        partOf: 'activity.phone.notifications',
      }),
      metric('notificationPeak', 'count', busiest, {
        parts: ['activity.phone.notifications'],
      }),
    );
  }
  return metrics.filter(one => one.days.length);
}

function add(
  map: Map<LocalDate, number>,
  day: LocalDate,
  value: number,
): Map<LocalDate, number> {
  return map.set(day, (map.get(day) ?? 0) + value);
}

function rounded(map: Map<LocalDate, number>): Map<LocalDate, number> {
  return new Map(
    [...map].map(([day, value]) => [day, Math.round(value * 100) / 100]),
  );
}
