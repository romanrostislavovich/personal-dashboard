import {Inject, Injectable} from '@nestjs/common';
import {DB, Database, LinksService, UsersService} from '@pd/api-core';
import {
  ActivityIndices,
  addDays,
  defaultActivityCategory,
  LocalDate,
  parseLocalDate,
  toLocalDate,
  zonedDateTime,
  zonedToUtc,
} from '@pd/contracts';
import {and, asc, eq, gte, lt, sql} from 'drizzle-orm';
import {
  activityDevices,
  activityFocusSessions,
  activitySiteVisits,
  activitySpans,
} from '../activity.schema';
import {ActivityService} from '../activity.service';
import {activityPhoneNotifications} from '../phone-notifications.schema';
import {activityPhoneUnlocks} from '../phone/phone-unlocks.schema';
import {
  DayMoments,
  dayIndices,
  IndexSpan,
  spreadOf,
  usualBedtime,
} from './day-indices';
import {activityDayIndices} from './indices.schema';
import {indexSummary, summaryPeriod} from './indices-summary';

const HOUR = 3_600_000;
const PHONES = ['android', 'ios'];
/** The night after a day is read up to 04:00 of the next one. */
const NIGHT_HOURS = 28;
/** How many days without indices one run counts back in history: the job stays light. */
const BACKFILL_DAYS = 60;
/** The usual bedtime is of the last four weeks; the spread of a week. */
const BEDTIME_DAYS = 28;
const SPREAD_DAYS = 7;
/** Kept for the bedtime and its spread; not a number of Links by itself. */
export const LAST_USE = '_lastUse';

/**
 * Counts and keeps Links v2's indices of each day (see dayIndices): today and yesterday on every
 * run, and a part of the days before that still have none, until the history is counted.
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
    const rows = await this.db
      .selectDistinct({userId: activitySpans.userId})
      .from(activitySpans)
      .where(gte(activitySpans.startedAt, since));
    return rows.map(row => row.userId);
  }

  /** Today, yesterday, and up to BACKFILL_DAYS of the days before without indices. */
  async refresh(userId: string): Promise<void> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    const today = zonedDateTime(new Date(), timeZone).date;
    const yesterday = shift(today, -1);
    const missing = await this.missingDays(userId, timeZone, yesterday);
    const days = [...missing.slice(-BACKFILL_DAYS), yesterday, today];
    // The band's bedtimes of the whole stretch at once: Health is asked through the core.
    const band = await this.links.dailyMetric(userId, 'health.band.bedtime', {
      from: shift(days[0], -BEDTIME_DAYS),
      to: today,
    });
    const bedtimes = new Map(band?.days.map(one => [one.day, one.value]) ?? []);
    // Oldest first: a day's bedtime spread reads the days before it.
    for (const day of days) {
      await this.count(userId, day, timeZone, bedtimes);
    }
  }

  /** Counts one day again and replaces what was kept for it. */
  async count(
    userId: string,
    day: LocalDate,
    timeZone: string,
    bandBedtimes: Map<LocalDate, number> = new Map(),
  ): Promise<void> {
    const moments = await this.moments(userId, day, timeZone, bandBedtimes);
    const indices = dayIndices(moments);
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
    const d = activityDayIndices;
    await this.db.transaction(async tx => {
      await tx.delete(d).where(and(eq(d.userId, userId), eq(d.day, day)));
      if (indices.size) {
        await tx
          .insert(d)
          .values(
            [...indices].map(([key, value]) => ({userId, day, key, value})),
          );
      }
    });
  }

  /** Today, the week and the owner's norm of each index (see indexSummary). */
  async summary(userId: string): Promise<ActivityIndices> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    const today = zonedDateTime(new Date(), timeZone).date;
    const kept = await this.read(userId, summaryPeriod(today));
    return {today, indices: indexSummary(kept, today)};
  }

  /** What is kept for a period, by key and day; `_lastUse` left out. */
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
      if (key !== LAST_USE) {
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

  /** The days from the first span to `before` that have no index kept yet. */
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
    const d = activityDayIndices;
    const counted = new Set(
      (
        await this.db
          .selectDistinct({day: d.day})
          .from(d)
          .where(and(eq(d.userId, userId), gte(d.day, first.day)))
      ).map(row => row.day),
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
    timeZone: string,
    bandBedtimes: Map<LocalDate, number>,
  ): Promise<DayMoments> {
    const start = zonedToUtc({date: day, time: '00:00'}, timeZone);
    const end = zonedToUtc({date: shift(day, 1), time: '00:00'}, timeZone);
    const until = new Date(start.getTime() + NIGHT_HOURS * HOUR);
    const chosen = await this.activity.chosenCategories(userId);
    const categoryOf = (app: string) =>
      chosen.get(app) ?? defaultActivityCategory(app);

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
      spans: all,
      unlocks: unlocks.map(row => row.at.getTime()).sort((a, b) => a - b),
      notifications: notifications
        .map(row => row.at.getTime())
        .sort((a, b) => a - b),
      focus: focus.map(row => ({
        start: row.start.getTime(),
        end: row.end.getTime(),
      })),
      bedtime: await this.bedtime(userId, day, bandBedtimes),
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

/** The last moment on the phone between 04:00 of the day and 04:00 of the next, as hours. */
export function lastUseOf(day: DayMoments): number | null {
  const from = day.start + 4 * HOUR;
  const to = day.start + NIGHT_HOURS * HOUR;
  const moments = [
    ...day.spans
      .filter(
        span => span.device === 'phone' && span.end > from && span.start < to,
      )
      .map(span => Math.min(span.end, to)),
    ...day.unlocks.filter(at => at >= from && at < to),
  ];
  return moments.length
    ? Math.round(((Math.max(...moments) - day.start) / HOUR) * 100) / 100
    : null;
}

function shift(day: LocalDate, by: number): LocalDate {
  return toLocalDate(addDays(parseLocalDate(day), by));
}
