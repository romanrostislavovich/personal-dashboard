import {Injectable, OnModuleInit} from '@nestjs/common';
import {LinksService} from '@pd/api-core';
import {
  addDays,
  HourEvent,
  HourlyMetric,
  LocalDate,
  parseLocalDate,
  toLocalDate,
  zonedDateTime,
} from '@pd/contracts';
import {homeLeavings} from '../places/day-numbers';
import {MIN_DAY_POINTS, PlacesService} from '../places/places.service';
import {
  HOUR_EVENTS,
  HOURLY_COUNTS,
  HOURLY_MINUTES,
  NOTIFICATION_PEAK,
} from './day-hours';
import {IndicesService} from './indices.service';

/** A burst: at least this many notifications in ten minutes … */
const MIN_BURST = 4;
/** … and more than in nine of ten of the user's own busiest ten minutes of an hour. */
const BURST_PERCENTILE = 0.9;
/** Home is found over the nights before the period too, as for the day's numbers. */
const HOME_HISTORY_DAYS = 60;

/** The hourly numbers that are an event itself: not compared with it. */
const ITSELF: Record<string, string[]> = {
  notificationBurst: ['activity.hour.notifications'],
  draining: ['activity.hour.draining'],
  meeting: ['activity.hour.meetings'],
  game: ['activity.hour.games'],
  longPhone: ['activity.hour.phone', 'activity.hour.unlocks'],
  focusEnd: ['activity.hour.focus'],
};

/**
 * The tracker's hours to Links (Links v2, hours): the minutes and counts of every hour kept by
 * the indices job (see dayHours), the events of the hours, a burst of notifications against the
 * user's own usual, and the hours home was left. Only the days the tracker saw anything.
 */
@Injectable()
export class HoursLinks implements OnModuleInit {
  constructor(
    private readonly links: LinksService,
    private readonly indices: IndicesService,
    private readonly places: PlacesService,
  ) {}

  onModuleInit(): void {
    this.links.registerHourly({
      module: 'activity',
      hours: async (userId, period, timeZone) => {
        const rows = await this.indices.hours(userId, period);
        const days = [...new Set(rows.map(row => row.day))].sort();
        const hourOf = (row: {day: LocalDate; hour: number}) =>
          `${row.day}T${String(row.hour).padStart(2, '0')}`;
        const byKey = new Map<string, {hour: string; value: number}[]>();
        for (const row of rows) {
          const list = byKey.get(row.key);
          const item = {hour: hourOf(row), value: row.value};
          if (list) {
            list.push(item);
          } else {
            byKey.set(row.key, [item]);
          }
        }
        const metric = (key: string, unit: HourlyMetric['unit']) => ({
          key: `activity.hour.${key}`,
          module: 'activity',
          labelKey: `activity.links.hour.${key}`,
          unit,
          ...(key === 'deepWork' ? {productive: true as const} : {}),
          days,
          hours: byKey.get(key) ?? [],
        });
        const event = (key: string, hours: string[], of = days): HourEvent => ({
          key: `activity.event.${key}`,
          module: 'activity',
          labelKey: `activity.links.event.${key}`,
          days: of,
          hours,
          itself: ITSELF[key] ?? [],
        });

        // A burst is the user's own: beyond nine of ten of their busiest ten minutes of an hour.
        const peaks = byKey.get(NOTIFICATION_PEAK) ?? [];
        const sorted = peaks.map(one => one.value).sort((a, b) => a - b);
        const threshold = Math.max(
          MIN_BURST,
          sorted[Math.floor(sorted.length * BURST_PERCENTILE)] ?? 0,
        );

        const metrics: HourlyMetric[] = days.length
          ? [
              ...HOURLY_MINUTES.map(key => metric(key, 'minutes')),
              ...HOURLY_COUNTS.map(key => metric(key, 'count')),
            ]
          : [];
        const events: HourEvent[] = days.length
          ? [
              event(
                'notificationBurst',
                peaks
                  .filter(one => one.value >= threshold)
                  .map(one => one.hour),
              ),
              ...HOUR_EVENTS.map(key =>
                event(
                  key,
                  (byKey.get(`event.${key}`) ?? []).map(one => one.hour),
                ),
              ),
              ...(await this.leftHome(userId, period, timeZone)),
            ]
          : [];
        return {
          metrics,
          events: events.filter(one => one.hours.length),
        };
      },
    });
  }

  /** The hours home was left, on the days the phone told enough about where it was. */
  private async leftHome(
    userId: string,
    period: {from: LocalDate; to: LocalDate},
    timeZone: string,
  ): Promise<HourEvent[]> {
    const from = toLocalDate(
      addDays(parseLocalDate(period.from), -HOME_HISTORY_DAYS),
    );
    const [days, named] = await Promise.all([
      this.places.days(userId, {from, to: period.to}, timeZone),
      this.places.named(userId),
    ]);
    const told = days
      .filter(day => day.day >= period.from && day.points >= MIN_DAY_POINTS)
      .map(day => day.day);
    if (!told.length) {
      return [];
    }
    const hours = homeLeavings(days, named)
      .map(at => zonedDateTime(new Date(at), timeZone))
      .filter(at => at.date >= period.from && at.date <= period.to)
      .map(at => `${at.date}T${at.time.slice(0, 2)}`);
    return [
      {
        key: 'activity.event.leftHome',
        module: 'activity',
        labelKey: 'activity.links.event.leftHome',
        days: told,
        hours: [...new Set(hours)],
      },
    ];
  }
}
