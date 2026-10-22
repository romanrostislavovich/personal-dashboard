import { Inject, Injectable } from '@nestjs/common';
import { DB, Database, OtherComputersService, ProjectsService, UsersService } from '@pd/api-core';
import {
  ActivityApp,
  ActivityAppUpdate,
  ActivityCategory,
  ActivityDayQuery,
  ActivityDeviceConfig,
  ActivityPeriod,
  ActivityProjectRule,
  ActivityProjectRuleInput,
  ACTIVITY_DISTRACTING_CATEGORIES,
  ActivitySettings,
  ActivitySettingsUpdate,
  ActivitySpanInput,
  ActivityOtherComputer,
  ActivityStats,
  ActivityTimelineEntry,
  addDays,
  DEFAULT_DISTRACTING_SITES,
  LocalDate,
  parseLocalDate,
  toLocalDate,
  zonedToUtc,
} from '@pd/contracts';
import { and, asc, desc, eq, gt, gte, inArray, lt, SQL, sql } from 'drizzle-orm';
import {
  ActivityRecords,
  appsOfCategories,
  buildRecords,
  buildStats,
  categoryOf,
  ProjectPatterns,
  UsageRow,
  watchedApps,
} from './activity-stats';
import {
  activityApps,
  ActivityDeviceRow,
  activityDevices,
  activityProjectRules,
  activitySettings,
  activitySiteVisits,
  activitySpans,
} from './activity.schema';
import {
  newTime,
  otherComputers,
  OtherComputerTime,
  timeByClock,
  withOtherComputers,
} from './other-computers';
import { dayBounds, secondsByDay, spanOf, TimeSpan } from './time-spans';
import { MAX_VISIT_SECONDS } from './visit-length';

const DEFAULT_SETTINGS: ActivitySettings = {
  idleMinutes: 5,
  breakMinutes: 60,
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  roundsBeforeLongBreak: 4,
  privateWords: [],
  summaryTime: '21:00',
  skippedComputers: [],
  gamesMinutesPerTask: 0,
  trackSites: true,
  distractingSites: DEFAULT_DISTRACTING_SITES,
};
/** "From the beginning" for the services asked about a period. */
const EVER_SINCE = '2000-01-01';
/** The hours of the user's own clock the achievements call night and early morning. */
const NIGHT_ENDS_AT = 5;
const MORNING_ENDS_AT = 8;

/** Everything recorded, in the numbers the achievements look at. */
export interface ActivityAllTime extends ActivityRecords {
  /** From midnight to five in the morning. */
  nightSeconds: number;
  /** From five to eight in the morning. */
  earlySeconds: number;
  weekendSeconds: number;
  /** Time whose window title matched one of the projects. */
  projectSeconds: number;
  /** Trackers registered. */
  devices: number;
}
/** Rows per INSERT: eight values each, far below PostgreSQL's limit of 65,535 parameters. */
const INSERT_CHUNK = 500;
/** A span is a few minutes long (the tracker cuts it); anything longer is a clock gone wrong. */
const MAX_SPAN_SECONDS = 60 * 60;

/**
 * Time at the computer: what trackers send (stretches of time a window was in front) and what
 * the section shows of it — per day, program, category, project and device.
 */
@Injectable()
export class ActivityService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly others: OtherComputersService,
    private readonly projectsService: ProjectsService,
  ) {}

  // --- What a tracker does ---

  /** Saves the spans of a device; excluded programs and what was already sent are skipped. */
  async ingest(device: ActivityDeviceRow, spans: ActivitySpanInput[]): Promise<number> {
    const excluded = new Set((await this.config(device.userId)).excludedApps);
    const rows = spans.flatMap((span) => {
      const app = span.app.trim().toLowerCase();
      const startedAt = new Date(span.startedAt);
      const endedAt = new Date(span.endedAt);
      const seconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
      if (excluded.has(app) || seconds < 1 || seconds > MAX_SPAN_SECONDS) {
        return [];
      }
      return [
        {
          userId: device.userId,
          deviceId: device.id,
          app,
          appName: span.appName?.trim() || span.app.trim(),
          title: span.title,
          startedAt,
          endedAt,
          seconds,
        },
      ];
    });
    let saved = 0;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const inserted = await this.db
        .insert(activitySpans)
        .values(rows.slice(i, i + INSERT_CHUNK))
        .onConflictDoNothing()
        .returning({ id: activitySpans.id });
      saved += inserted.length;
    }
    return saved;
  }

  /**
   * What a tracker has to know: when the user is "away", what not to record, when to suggest
   * a break, the focus timer and what distracts from it.
   */
  async config(userId: string): Promise<ActivityDeviceConfig> {
    const apps = await this.db
      .select({
        app: activityApps.app,
        category: activityApps.category,
        excluded: activityApps.excluded,
      })
      .from(activityApps)
      .where(eq(activityApps.userId, userId));
    const settings = await this.settings(userId);
    return {
      idleMinutes: settings.idleMinutes,
      excludedApps: apps.filter((row) => row.excluded).map((row) => row.app),
      watchApps: watchedApps(apps),
      breakMinutes: settings.breakMinutes,
      focus: {
        focusMinutes: settings.focusMinutes,
        shortBreakMinutes: settings.shortBreakMinutes,
        longBreakMinutes: settings.longBreakMinutes,
        roundsBeforeLongBreak: settings.roundsBeforeLongBreak,
      },
      distractingApps: appsOfCategories(apps, ACTIVITY_DISTRACTING_CATEGORIES),
      privateWords: settings.privateWords,
      meetingApps: appsOfCategories(apps, ['meetings']),
    };
  }

  // --- Settings ---

  async settings(userId: string): Promise<ActivitySettings> {
    const [row] = await this.db
      .select()
      .from(activitySettings)
      .where(eq(activitySettings.userId, userId));
    return row
      ? {
          idleMinutes: row.idleMinutes,
          breakMinutes: row.breakMinutes,
          focusMinutes: row.focusMinutes,
          shortBreakMinutes: row.shortBreakMinutes,
          longBreakMinutes: row.longBreakMinutes,
          roundsBeforeLongBreak: row.roundsBeforeLongBreak,
          privateWords: row.privateWords,
          summaryTime: row.summaryTime,
          skippedComputers: row.skippedComputers,
          gamesMinutesPerTask: row.gamesMinutesPerTask,
          trackSites: row.trackSites,
          distractingSites: row.distractingSites,
        }
      : DEFAULT_SETTINGS;
  }

  /** Only the fields sent change. */
  async saveSettings(userId: string, update: ActivitySettingsUpdate): Promise<void> {
    const settings = { ...(await this.settings(userId)), ...update };
    await this.db
      .insert(activitySettings)
      .values({ userId, ...settings })
      .onConflictDoUpdate({ target: activitySettings.userId, set: settings });
  }

  // --- Programs ---

  /** Every program seen or configured, with its category and whether it is recorded. */
  async apps(userId: string): Promise<ActivityApp[]> {
    const seen = await this.db
      .select({ app: activitySpans.app, name: sql<string>`max(${activitySpans.appName})` })
      .from(activitySpans)
      .where(eq(activitySpans.userId, userId))
      .groupBy(activitySpans.app);
    const chosen = await this.db.select().from(activityApps).where(eq(activityApps.userId, userId));
    const categories = new Map(chosen.map((row) => [row.app, row.category]));
    const excluded = new Set(chosen.filter((row) => row.excluded).map((row) => row.app));
    const names = new Map(seen.map((row) => [row.app, row.name]));
    // An excluded program has no spans any more, but stays in the list to be let back in.
    for (const row of chosen) {
      if (!names.has(row.app)) {
        names.set(row.app, row.app);
      }
    }
    return [...names.entries()]
      .map(([app, name]) => ({
        app,
        name,
        category: categoryOf(app, categories),
        excluded: excluded.has(app),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Gives a program a category, or stops recording it. Excluding deletes what was recorded:
   * "do not record" means there is no trace of it.
   */
  async updateApp(userId: string, app: string, update: ActivityAppUpdate): Promise<void> {
    const key = app.trim().toLowerCase();
    await this.db
      .insert(activityApps)
      .values({ userId, app: key, ...update })
      .onConflictDoUpdate({ target: [activityApps.userId, activityApps.app], set: update });
    if (update.excluded) {
      await this.db
        .delete(activitySpans)
        .where(and(eq(activitySpans.userId, userId), eq(activitySpans.app, key)));
    }
  }

  // --- Project rules ---

  async rules(userId: string): Promise<ActivityProjectRule[]> {
    return this.db
      .select({
        id: activityProjectRules.id,
        projectId: activityProjectRules.projectId,
        pattern: activityProjectRules.pattern,
      })
      .from(activityProjectRules)
      .where(eq(activityProjectRules.userId, userId))
      .orderBy(asc(activityProjectRules.pattern));
  }

  async addRule(userId: string, input: ActivityProjectRuleInput): Promise<void> {
    // A rule may only point at the user's own project.
    await this.projectsService.assertOwned(userId, input.projectId);
    await this.db
      .insert(activityProjectRules)
      .values({ userId, ...input })
      .onConflictDoNothing();
  }

  async removeRule(userId: string, id: string): Promise<void> {
    await this.db
      .delete(activityProjectRules)
      .where(and(eq(activityProjectRules.id, id), eq(activityProjectRules.userId, userId)));
  }

  // --- What the section shows ---

  /** The numbers of a period; days are the user's own (their time zone). */
  async stats(userId: string, period: ActivityPeriod): Promise<ActivityStats> {
    const timeZone = await this.timeZone(userId);
    const s = activitySpans;
    const day = sql<LocalDate>`to_char(${s.startedAt} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`;
    const rows: UsageRow[] = await this.db
      .select({
        day,
        deviceId: s.deviceId,
        app: s.app,
        appName: sql<string>`max(${s.appName})`,
        title: s.title,
        seconds: sql<number>`sum(${s.seconds})::int`,
      })
      .from(s)
      .where(this.within(userId, period, timeZone))
      // By position: the time zone is a parameter, and PostgreSQL does not see the same
      // expression with another parameter number as the one selected.
      .groupBy(sql`1`, s.deviceId, s.app, s.title);

    const devices = await this.db
      .select({ id: activityDevices.id, name: activityDevices.name })
      .from(activityDevices)
      .where(eq(activityDevices.userId, userId));
    const stats = buildStats(rows, period, {
      categories: await this.chosenCategories(userId),
      projects: await this.projectPatterns(userId),
      devices,
    });
    if (period.deviceId) {
      return stats; // One computer of the tracker was asked for: the others are not its time.
    }
    const times = await this.otherTimes(userId, period, timeZone, devices);
    if (!times.length) {
      return stats;
    }
    // Games of a service (Steam) add only what the tracker has not seen itself.
    const chosen = await this.chosenCategories(userId);
    const trackedGames = new Map<LocalDate, number>();
    for (const row of rows) {
      if (categoryOf(row.app, chosen, row.title) === 'games') {
        trackedGames.set(row.day, (trackedGames.get(row.day) ?? 0) + row.seconds);
      }
    }
    return withOtherComputers(
      stats,
      times,
      await this.computersOf(userId, times, devices),
      trackedGames,
    );
  }

  /**
   * When the computer was first and last used on each day, in hours of the user's clock — a
   * rough picture of the daily rhythm. A day lasts until four in the morning, so working past
   * midnight is a late evening (over 24), not an early morning.
   */
  async dayBounds(
    userId: string,
    period: ActivityPeriod,
  ): Promise<{ day: LocalDate; first: number; last: number }[]> {
    const timeZone = await this.timeZone(userId);
    const s = activitySpans;
    type Moment = typeof s.startedAt | typeof s.endedAt;
    const local = (column: Moment) => sql`(${column} AT TIME ZONE ${timeZone})`;
    const dayStart = sql`date_trunc('day', ${local(s.startedAt)} - interval '4 hours')`;
    const hours = (column: Moment) =>
      sql`extract(epoch from ${local(column)} - ${dayStart}) / 3600`;
    const rows = await this.db
      .select({
        day: sql<LocalDate>`to_char(${dayStart}, 'YYYY-MM-DD')`,
        first: sql<number>`round(min(${hours(s.startedAt)})::numeric, 2)::float`,
        last: sql<number>`round(max(${hours(s.endedAt)})::numeric, 2)::float`,
      })
      .from(s)
      .where(this.within(userId, period, timeZone))
      .groupBy(sql`1`);
    return rows;
  }

  /** Time per window title since a moment, lower case — to find what a title names. */
  async titleSeconds(userId: string, since: Date): Promise<{ title: string; seconds: number }[]> {
    const s = activitySpans;
    return this.db
      .select({
        title: sql<string>`lower(${s.title})`,
        seconds: sql<number>`sum(${s.seconds})::int`,
      })
      .from(s)
      .where(and(eq(s.userId, userId), gte(s.startedAt, since), sql`${s.title} <> ''`))
      .groupBy(sql`1`);
  }

  /**
   * The tracker's own time in games per day of a period. `late` — only the time started from
   * 23:00 to 04:00, counted to the evening it began on (a game at one at night is the day's).
   */
  async gamesByDay(
    userId: string,
    period: ActivityPeriod,
    { late = false } = {},
  ): Promise<Map<LocalDate, number>> {
    const timeZone = await this.timeZone(userId);
    const s = activitySpans;
    const local = sql`(${s.startedAt} AT TIME ZONE ${timeZone})`;
    const day = late
      ? sql<LocalDate>`to_char(${local} - interval '4 hours', 'YYYY-MM-DD')`
      : sql<LocalDate>`to_char(${local}, 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({ day, app: s.app, seconds: sql<number>`sum(${s.seconds})::int` })
      .from(s)
      .where(
        and(
          this.within(userId, period, timeZone),
          late
            ? sql`(extract(hour from ${local}) >= 23 or extract(hour from ${local}) < 4)`
            : undefined,
        ),
      )
      .groupBy(sql`1`, s.app);
    const chosen = await this.chosenCategories(userId);
    const games = new Map<LocalDate, number>();
    for (const row of rows) {
      if (categoryOf(row.app, chosen) === 'games') {
        games.set(row.day, (games.get(row.day) ?? 0) + row.seconds);
      }
    }
    return games;
  }

  /**
   * The computers other services know (a work laptop in WakaTime) over a period, each with
   * whether its time is added to the time at the computer — for the settings.
   */
  async otherComputers(userId: string, period: ActivityPeriod): Promise<ActivityOtherComputer[]> {
    const devices = await this.db
      .select({ name: activityDevices.name })
      .from(activityDevices)
      .where(eq(activityDevices.userId, userId));
    const times = await this.otherTimes(userId, period, await this.timeZone(userId), devices);
    return this.computersOf(userId, times, devices);
  }

  /**
   * The time other services know over a period. Where they know its stretches (WakaTime's
   * durations, the browser extension's visits) it is put together with the tracker's by the
   * clock, what overlaps counted once (see timeByClock); a computer-day without them counts by
   * the day, as the service totals it.
   */
  private async otherTimes(
    userId: string,
    period: ActivityPeriod,
    timeZone: string,
    devices: { name: string }[],
  ): Promise<OtherComputerTime[]> {
    const byDay = await this.others.days(userId, period.from, period.to);
    const bounds = dayBounds(period, timeZone);
    const from = new Date(bounds[0].start);
    const to = new Date(bounds[bounds.length - 1].end);
    const keyOf = (item: { source: string; computer: string }) =>
      `${item.source}:${item.computer.toLowerCase()}`;
    // Only the computers that count: the tracker's own computers are already in its time.
    const counted = new Set(
      (await this.computersOf(userId, byDay, devices))
        .filter((computer) => computer.counted)
        .map(keyOf),
    );
    const computers = new Map<string, { computer: string; source: string; spans: TimeSpan[] }>();
    for (const span of await this.others.spans(userId, from, to)) {
      if (!counted.has(keyOf(span))) {
        continue;
      }
      const known = computers.get(keyOf(span)) ?? {
        computer: span.computer,
        source: span.source,
        spans: [],
      };
      known.spans.push(spanOf(span));
      computers.set(keyOf(span), known);
    }
    const v = activitySiteVisits;
    const visits = await this.db
      .select({ startedAt: v.startedAt, endedAt: v.endedAt })
      .from(v)
      .where(
        and(
          eq(v.userId, userId),
          lt(v.startedAt, to),
          gt(v.endedAt, from),
          // A visit is never longer than this: the index on its start is used from here.
          gte(v.startedAt, new Date(from.getTime() - MAX_VISIT_SECONDS * 1000)),
        ),
      );
    if (!computers.size && !visits.length) {
      return byDay;
    }
    const others = [
      ...[...computers.values()].flatMap((item) => item.spans),
      ...visits.map(spanOf),
    ];
    const tracker = await this.trackerSpans(userId, period, timeZone, [
      ...secondsByDay(others, bounds).keys(),
    ]);
    const clock = timeByClock({
      tracker,
      computers: [...computers.values()],
      browser: visits.map(spanOf),
      days: bounds,
    });
    // A computer-day known by the clock is not counted by its total as well.
    const byClock = new Set(
      [...computers.entries()].flatMap(([key, { spans }]) =>
        [...secondsByDay(spans, bounds).keys()].map((day) => `${key}|${day}`),
      ),
    );
    return [...byDay.filter((time) => !byClock.has(`${keyOf(time)}|${time.day}`)), ...clock];
  }

  /**
   * The stretches of the tracker on these days, of every computer. Only the days other time is
   * known on are read: a long period would otherwise bring every span of it.
   */
  private async trackerSpans(
    userId: string,
    period: ActivityPeriod,
    timeZone: string,
    days: LocalDate[],
  ): Promise<TimeSpan[]> {
    if (!days.length) {
      return [];
    }
    const s = activitySpans;
    const day = sql<LocalDate>`to_char(${s.startedAt} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({ startedAt: s.startedAt, endedAt: s.endedAt })
      .from(s)
      .where(and(this.within(userId, period, timeZone), inArray(day, days)));
    return rows.map(spanOf);
  }

  private async computersOf(
    userId: string,
    times: OtherComputerTime[],
    devices: { name: string }[],
  ): Promise<ActivityOtherComputer[]> {
    if (!times.length) {
      return [];
    }
    const { skippedComputers } = await this.settings(userId);
    return otherComputers(
      times,
      devices.map((device) => device.name),
      skippedComputers,
    );
  }

  /** What was in front, minute by minute, on one day — newest first. */
  async timeline(userId: string, query: ActivityDayQuery): Promise<ActivityTimelineEntry[]> {
    const timeZone = await this.timeZone(userId);
    const categories = await this.chosenCategories(userId);
    const rows = await this.db
      .select()
      .from(activitySpans)
      .where(this.within(userId, { from: query.day, to: query.day, ...query }, timeZone))
      .orderBy(desc(activitySpans.startedAt));
    return rows.map((row) => ({
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt.toISOString(),
      app: row.app,
      name: row.appName,
      title: row.title,
      category: categoryOf(row.app, categories, row.title),
      deviceId: row.deviceId,
    }));
  }

  /**
   * The numbers of everything recorded — what the achievements look at: totals, days and
   * streaks, and the time at night, early in the morning, on weekends and on projects.
   */
  async records(userId: string): Promise<ActivityAllTime> {
    const timeZone = await this.timeZone(userId);
    const s = activitySpans;
    const local = sql`(${s.startedAt} AT TIME ZONE ${timeZone})`;
    const rows = await this.db
      .select({
        day: sql<LocalDate>`to_char(${local}, 'YYYY-MM-DD')`,
        app: s.app,
        seconds: sql<number>`sum(${s.seconds})::int`,
      })
      .from(s)
      .where(eq(s.userId, userId))
      .groupBy(sql`1`, s.app);

    const hour = sql`extract(hour from ${local})`;
    const sum = (condition: SQL) =>
      sql<number>`coalesce(sum(${s.seconds}) filter (where ${condition}), 0)::int`;
    // A project is recognized by its name and rules anywhere in the window title.
    const patterns = (await this.projectPatterns(userId))
      .flatMap((project) => project.patterns)
      .map((pattern) => pattern.trim())
      .filter((pattern) => pattern.length >= 2)
      .map((pattern) => `%${pattern.replace(/[\\%_]/g, '\\$&')}%`);
    const [times] = await this.db
      .select({
        night: sum(sql`${hour} < ${NIGHT_ENDS_AT}`),
        early: sum(sql`${hour} >= ${NIGHT_ENDS_AT} and ${hour} < ${MORNING_ENDS_AT}`),
        weekend: sum(sql`extract(isodow from ${local}) >= 6`),
        projects: patterns.length
          ? sum(sql`${s.title} ilike any (${sql.param(patterns)}::text[])`)
          : sql<number>`0`,
      })
      .from(s)
      .where(eq(s.userId, userId));
    const devices = await this.db.$count(activityDevices, eq(activityDevices.userId, userId));
    const chosen = await this.chosenCategories(userId);
    const records = buildRecords(rows, chosen);
    // The totals are what the overview shows: with the computers and the games other services
    // know. The days, the streaks and the best day stay the tracker's own.
    const other = await this.otherAllTime(userId, rows, chosen);
    for (const [category, seconds] of other) {
      records.totalSeconds += seconds;
      records.byCategory.set(category, (records.byCategory.get(category) ?? 0) + seconds);
    }

    return {
      ...records,
      nightSeconds: times?.night ?? 0,
      earlySeconds: times?.early ?? 0,
      weekendSeconds: times?.weekend ?? 0,
      projectSeconds: times?.projects ?? 0,
      devices,
    };
  }

  /**
   * Everything other services ever added to the time at the computer, by what it was: work in
   * an IDE on a computer without the tracker, and games the tracker has not seen itself.
   */
  private async otherAllTime(
    userId: string,
    rows: { day: LocalDate; app: string; seconds: number }[],
    chosen: ReadonlyMap<string, ActivityCategory | null>,
  ): Promise<Map<NonNullable<OtherComputerTime['category']> | 'development', number>> {
    const added = new Map<NonNullable<OtherComputerTime['category']> | 'development', number>();
    const times = await this.others.days(userId, EVER_SINCE, await this.today(userId));
    if (!times.length) {
      return added;
    }
    const names = await this.db
      .select({ name: activityDevices.name })
      .from(activityDevices)
      .where(eq(activityDevices.userId, userId));
    const computers = await this.computersOf(userId, times, names);
    const counted = times.filter((time) =>
      computers.some(
        (item) =>
          item.counted &&
          item.source === time.source &&
          item.computer.trim().toLowerCase() === time.computer.trim().toLowerCase(),
      ),
    );
    const trackedGames = new Map<LocalDate, number>();
    for (const row of rows) {
      if (categoryOf(row.app, chosen) === 'games') {
        trackedGames.set(row.day, (trackedGames.get(row.day) ?? 0) + row.seconds);
      }
    }
    for (const time of newTime(counted, trackedGames)) {
      const category = time.category ?? 'development';
      added.set(category, (added.get(category) ?? 0) + time.seconds);
    }
    return added;
  }

  /** Seconds at the computer on the user's today — for the widget and the digest. */
  async todaySeconds(userId: string): Promise<number> {
    const today = await this.today(userId);
    return (await this.stats(userId, { from: today, to: today })).totalSeconds;
  }

  async today(userId: string): Promise<LocalDate> {
    const timeZone = await this.timeZone(userId);
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  }

  /** The spans of a period of the user's own days, of one device or of all. */
  private within(userId: string, period: ActivityPeriod, timeZone: string) {
    const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
    return and(
      eq(activitySpans.userId, userId),
      gte(activitySpans.startedAt, zonedToUtc({ date: period.from, time: '00:00' }, timeZone)),
      lt(activitySpans.startedAt, zonedToUtc({ date: after, time: '00:00' }, timeZone)),
      period.deviceId ? eq(activitySpans.deviceId, period.deviceId) : undefined,
    );
  }

  async chosenCategories(userId: string): Promise<Map<string, ActivityCategory | null>> {
    const rows = await this.db
      .select({ app: activityApps.app, category: activityApps.category })
      .from(activityApps)
      .where(eq(activityApps.userId, userId));
    return new Map(rows.map((row) => [row.app, row.category]));
  }

  /** Each project is recognized by its own name and by the user's rules for it. */
  async projectPatterns(userId: string): Promise<ProjectPatterns[]> {
    const rules = await this.rules(userId);
    return (await this.projectsService.list(userId)).map((project) => ({
      projectId: project.id,
      name: project.name,
      patterns: [
        project.name,
        ...project.aliases,
        ...rules.filter((rule) => rule.projectId === project.id).map((rule) => rule.pattern),
      ],
    }));
  }

  async timeZone(userId: string): Promise<string> {
    return this.users.timeZoneOf(await this.users.findById(userId));
  }
}
