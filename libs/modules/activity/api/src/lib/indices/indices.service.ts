import {Inject, Injectable} from '@nestjs/common';
import {DB, Database, LinksService, UsersService} from '@pd/api-core';
import {
  ActivityCategory,
  ActivityIndices,
  addDays,
  defaultActivityCategory,
  LocalDate,
  parseLocalDate,
  toLocalDate,
  zonedDateTime,
  zonedToUtc,
} from '@pd/contracts';
import {and, asc, eq, gte, inArray, lt, sql} from 'drizzle-orm';
import {
  activityDevices,
  activityFocusSessions,
  activitySiteVisits,
  activitySpans,
} from '../activity.schema';
import {ActivityService} from '../activity.service';
import {activityPhoneNotifications} from '../phone-notifications.schema';
import {activityPhoneUnlocks} from '../phone/phone-unlocks.schema';
import {MAX_VISIT_SECONDS} from '../visit-length';
import {
  DayMoments,
  dayIndices,
  IndexSpan,
  spreadOf,
  usualBedtime,
  wallClock,
} from './day-indices';
import {activityDayIndices} from './indices.schema';
import {indexSummary, summaryPeriod} from './indices-summary';

const HOUR = 3_600_000;
const PHONES = ['android', 'ios'];
/** The night after a day is read up to 04:00 of the next one. */
const NIGHT_HOURS = 28;
/** A tracker cuts a span at an hour (ActivityService): a span touching a day began after this. */
const MAX_SPAN_MS = HOUR;
/** How many days of history one run counts, oldest first: the job stays light. */
const BACKFILL_DAYS = 60;
/** Recounted on every run: the spans of a laptop that synced late, a category changed. */
const RECOUNT_DAYS = 7;
/** The usual bedtime is of the last four weeks; the spread of a week. */
const BEDTIME_DAYS = 28;
const SPREAD_DAYS = 7;
/** Kept, not shown (keys starting with `_`): the phone's last use (for the bedtime) … */
export const LAST_USE = '_lastUse';
/** … and the mark of a day counted, even one with nothing to count (so it is not again). */
export const COUNTED = '_counted';

/** What one run reads once for all the days it counts. */
interface RunContext {
  timeZone: string;
  categories: Map<string, ActivityCategory | null>;
  bandBedtimes: Map<LocalDate, number>;
}

/**
 * Counts and keeps Links v2's indices of each day (see dayIndices): the last RECOUNT_DAYS on
 * every run, and the history not counted yet, oldest first, BACKFILL_DAYS at a time. The rows of
 * a day keep their ids (upserted, only what changed is written): the table is synced, and a
 * row replaced every hour would churn the sync and its conflicts.
 */
@Injectable()
export class IndicesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly activity: ActivityService,
    private readonly links: LinksService,
  ) {}

  /** The users with spans or site visits of the last two weeks. */
  async activeUserIds(): Promise<string[]> {
    const since = new Date(Date.now() - 14 * 24 * HOUR);
    const spans = await this.db
      .selectDistinct({userId: activitySpans.userId})
      .from(activitySpans)
      .where(gte(activitySpans.startedAt, since));
    const visits = await this.db
      .selectDistinct({userId: activitySiteVisits.userId})
      .from(activitySiteVisits)
      .where(gte(activitySiteVisits.startedAt, since));
    return [...new Set([...spans, ...visits].map(row => row.userId))];
  }

  /** The history not counted yet (oldest first, a part), then the last week again. */
  async refresh(userId: string): Promise<void> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    const today = zonedDateTime(new Date(), timeZone).date;
    const recent = Array.from({length: RECOUNT_DAYS}, (_, back) =>
      shift(today, back - RECOUNT_DAYS + 1),
    );
    const missing = await this.missingDays(userId, timeZone, recent[0]);
    // Oldest first: a day's usual bedtime and its spread read the days before it.
    await this.countDays(userId, timeZone, [
      ...missing.slice(0, BACKFILL_DAYS),
      ...recent,
    ]);
  }

  /** Counts the days in order with what they share read once. */
  async countDays(
    userId: string,
    timeZone: string,
    days: LocalDate[],
  ): Promise<void> {
    if (!days.length) {
      return;
    }
    // The band's bedtimes of the whole stretch at once: Health is asked through the core.
    const band = await this.links.dailyMetric(userId, 'health.band.bedtime', {
      from: shift(days[0], -BEDTIME_DAYS),
      to: days[days.length - 1],
    });
    const context: RunContext = {
      timeZone,
      categories: await this.activity.chosenCategories(userId),
      bandBedtimes: new Map(band?.days.map(one => [one.day, one.value]) ?? []),
    };
    for (const day of days) {
      await this.count(userId, day, context);
    }
  }

  /** Counts one day and keeps what changed. */
  private async count(
    userId: string,
    day: LocalDate,
    context: RunContext,
  ): Promise<void> {
    const moments = await this.moments(userId, day, context);
    const indices = dayIndices(moments);
    indices.set(COUNTED, 1);
    const lastUse = lastUseOf(moments);
    if (lastUse !== null) {
      indices.set(LAST_USE, lastUse);
      const week = await this.kept(
        userId,
        LAST_USE,
        shift(day, -SPREAD_DAYS + 1),
        shift(day, -1),
      );
      const spread = spreadOf([...week.values(), lastUse]);
      if (spread !== null) {
        indices.set('phone.bedtimeSpread', spread);
      }
    }
    await this.keep(userId, day, indices);
  }

  /**
   * Writes a day's indices: a new or changed value upserted on (user, day, key) so its row keeps
   * its id, a key the day no longer has deleted, an unchanged one left alone.
   */
  private async keep(
    userId: string,
    day: LocalDate,
    indices: Map<string, number>,
  ): Promise<void> {
    const d = activityDayIndices;
    const before = new Map(
      (
        await this.db
          .select({key: d.key, value: d.value})
          .from(d)
          .where(and(eq(d.userId, userId), eq(d.day, day)))
      ).map(row => [row.key, row.value]),
    );
    // `real` keeps about seven digits: compared at the precision it was stored with.
    const changed = [...indices].filter(
      ([key, value]) =>
        !before.has(key) ||
        Math.fround(value) !== Math.fround(before.get(key) as number),
    );
    const gone = [...before.keys()].filter(key => !indices.has(key));
    if (changed.length) {
      await this.db
        .insert(d)
        .values(changed.map(([key, value]) => ({userId, day, key, value})))
        .onConflictDoUpdate({
          target: [d.userId, d.day, d.key],
          set: {value: sql`excluded.value`},
        });
    }
    if (gone.length) {
      await this.db
        .delete(d)
        .where(and(eq(d.userId, userId), eq(d.day, day), inArray(d.key, gone)));
    }
  }

  /** Today, the week and the owner's norm of each index (see indexSummary). */
  async summary(userId: string): Promise<ActivityIndices> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    const today = zonedDateTime(new Date(), timeZone).date;
    const kept = await this.read(userId, summaryPeriod(today));
    return {today, indices: indexSummary(kept, today)};
  }

  /** The sum of an index over every day kept (the hours of deep work, for the achievements). */
  async total(userId: string, key: string): Promise<number> {
    const d = activityDayIndices;
    const [row] = await this.db
      .select({sum: sql<number>`coalesce(sum(${d.value}), 0)::float`})
      .from(d)
      .where(and(eq(d.userId, userId), eq(d.key, key)));
    return row?.sum ?? 0;
  }

  /** What is kept for a period, by key and day; the hidden keys (`_…`) left out. */
  async read(
    userId: string,
    period: {from: LocalDate; to: LocalDate},
  ): Promise<Map<string, {day: LocalDate; value: number}[]>> {
    const d = activityDayIndices;
    const rows = await this.db
      .select({day: d.day, key: d.key, value: d.value})
      .from(d)
      .where(
        and(
          eq(d.userId, userId),
          gte(d.day, period.from),
          sql`${d.day} <= ${period.to}`,
        ),
      )
      .orderBy(asc(d.day));
    const byKey = new Map<string, {day: LocalDate; value: number}[]>();
    for (const {day, key, value} of rows) {
      if (!key.startsWith('_')) {
        byKey.set(key, [...(byKey.get(key) ?? []), {day, value}]);
      }
    }
    return byKey;
  }

  private async kept(
    userId: string,
    key: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<Map<LocalDate, number>> {
    const d = activityDayIndices;
    const rows = await this.db
      .select({day: d.day, value: d.value})
      .from(d)
      .where(
        and(
          eq(d.userId, userId),
          eq(d.key, key),
          gte(d.day, from),
          sql`${d.day} <= ${to}`,
        ),
      );
    return new Map(rows.map(row => [row.day, row.value]));
  }

  /** The days from the first span to `before` not counted yet (no COUNTED mark), oldest first. */
  private async missingDays(
    userId: string,
    timeZone: string,
    before: LocalDate,
  ): Promise<LocalDate[]> {
    const [first] = await this.db
      .select({
        day: sql<LocalDate | null>`to_char(min(${activitySpans.startedAt}) AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`,
      })
      .from(activitySpans)
      .where(eq(activitySpans.userId, userId));
    if (!first?.day || first.day >= before) {
      return [];
    }
    const counted = new Set(
      (await this.kept(userId, COUNTED, first.day, before)).keys(),
    );
    const days: LocalDate[] = [];
    for (let day = first.day; day < before; day = shift(day, 1)) {
      if (!counted.has(day)) {
        days.push(day);
      }
    }
    return days;
  }

  /** Everything of a day and the night after it the indices are counted from. */
  private async moments(
    userId: string,
    day: LocalDate,
    context: RunContext,
  ): Promise<DayMoments> {
    const {timeZone, categories} = context;
    const next = shift(day, 1);
    // The local start of every hour 0…28 (to 04:00 of the next day), on the wall clock: on a
    // day the clocks change, 23:00 is still 23:00.
    const hours = Array.from({length: NIGHT_HOURS + 1}, (_, hour) =>
      zonedToUtc(
        {
          date: hour < 24 ? day : next,
          time: `${String(hour % 24).padStart(2, '0')}:00`,
        },
        timeZone,
      ).getTime(),
    );
    const start = new Date(hours[0]);
    const end = new Date(hours[24]);
    const until = new Date(hours[NIGHT_HOURS]);
    const categoryOf = (app: string) =>
      categories.get(app) ?? defaultActivityCategory(app);

    const s = activitySpans;
    const spans = await this.db
      .select({
        app: s.app,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        platform: activityDevices.platform,
      })
      .from(s)
      .innerJoin(activityDevices, eq(activityDevices.id, s.deviceId))
      .where(
        and(
          eq(s.userId, userId),
          // Bounded on both sides, so the (user, started) index is read for this day only.
          gte(s.startedAt, new Date(start.getTime() - MAX_SPAN_MS)),
          lt(s.startedAt, until),
          gte(s.endedAt, start),
        ),
      )
      .orderBy(asc(s.startedAt));
    const v = activitySiteVisits;
    const visits = await this.db
      .select({site: v.site, startedAt: v.startedAt, endedAt: v.endedAt})
      .from(v)
      .where(
        and(
          eq(v.userId, userId),
          gte(
            v.startedAt,
            new Date(start.getTime() - MAX_VISIT_SECONDS * 1000),
          ),
          lt(v.startedAt, until),
          gte(v.endedAt, start),
        ),
      );
    const u = activityPhoneUnlocks;
    const unlocks = await this.db
      .select({at: u.at})
      .from(u)
      .where(and(eq(u.userId, userId), gte(u.at, start), lt(u.at, until)));
    const n = activityPhoneNotifications;
    const notifications = await this.db
      .select({at: n.postedAt})
      .from(n)
      .where(
        and(
          eq(n.userId, userId),
          gte(n.postedAt, start),
          lt(n.postedAt, until),
        ),
      );
    const f = activityFocusSessions;
    const focus = await this.db
      .select({start: f.startedAt, end: f.endedAt})
      .from(f)
      .where(
        and(
          eq(f.userId, userId),
          gte(f.startedAt, start),
          lt(f.startedAt, end),
        ),
      );

    const all: IndexSpan[] = [
      ...spans.map(row => ({
        device: PHONES.includes(row.platform)
          ? ('phone' as const)
          : ('computer' as const),
        app: row.app,
        category: categoryOf(row.app),
        start: row.startedAt.getTime(),
        end: row.endedAt.getTime(),
      })),
      ...visits.map(row => ({
        device: 'browser' as const,
        app: row.site,
        category: 'browsing' as const,
        start: row.startedAt.getTime(),
        end: row.endedAt.getTime(),
      })),
    ].sort((a, b) => a.start - b.start);
    return {
      start: start.getTime(),
      end: end.getTime(),
      hours,
      spans: all,
      unlocks: unlocks.map(row => row.at.getTime()).sort((a, b) => a - b),
      notifications: notifications
        .map(row => row.at.getTime())
        .sort((a, b) => a - b),
      focus: focus.map(row => ({
        start: row.start.getTime(),
        end: row.end.getTime(),
      })),
      bedtime: await this.bedtime(userId, day, context.bandBedtimes),
    };
  }

  /**
   * The usual bedtime before the day: the band's (Health, through the core) over four weeks,
   * else the phone's last use kept here.
   */
  private async bedtime(
    userId: string,
    day: LocalDate,
    bandBedtimes: Map<LocalDate, number>,
  ): Promise<number | null> {
    const period = {from: shift(day, -BEDTIME_DAYS), to: shift(day, -1)};
    const fromBand = usualBedtime(
      [...bandBedtimes]
        .filter(([one]) => one >= period.from && one <= period.to)
        .map(([, value]) => value),
    );
    if (fromBand !== null) {
      return fromBand;
    }
    return usualBedtime([
      ...(await this.kept(userId, LAST_USE, period.from, period.to)).values(),
    ]);
  }
}

/** The last moment on the phone between 04:00 of the day and 04:00 of the next, as wall-clock hours. */
export function lastUseOf(day: DayMoments): number | null {
  const from = wallClock(day, 4);
  const to = wallClock(day, NIGHT_HOURS);
  const moments = [
    ...day.spans
      .filter(
        span => span.device === 'phone' && span.end > from && span.start < to,
      )
      .map(span => Math.min(span.end, to)),
    ...day.unlocks.filter(at => at >= from && at < to),
  ];
  if (!moments.length) {
    return null;
  }
  const last = Math.max(...moments);
  // Back from a moment to the hours of the wall clock.
  const hours = day.hours ?? [];
  let hour = 0;
  while (hour + 1 < hours.length && hours[hour + 1] <= last) {
    hour++;
  }
  const base = hours.length ? hours[hour] : day.start;
  const value = (hours.length ? hour : 0) + (last - base) / HOUR;
  return Math.round(value * 100) / 100;
}

function shift(day: LocalDate, by: number): LocalDate {
  return toLocalDate(addDays(parseLocalDate(day), by));
}
