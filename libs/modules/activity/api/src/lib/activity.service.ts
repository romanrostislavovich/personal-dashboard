import { Inject, Injectable } from '@nestjs/common';
import { DB, Database, ProjectsService, UsersService } from '@pd/api-core';
import {
  ActivityApp,
  ActivityAppUpdate,
  ActivityCategory,
  ActivityDayQuery,
  ActivityDeviceConfig,
  ActivityPeriod,
  ActivityProjectRule,
  ActivityProjectRuleInput,
  ActivitySettings,
  ActivitySpanInput,
  ActivityStats,
  ActivityTimelineEntry,
  addDays,
  LocalDate,
  parseLocalDate,
  toLocalDate,
  zonedToUtc,
} from '@pd/contracts';
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { buildStats, categoryOf, ProjectPatterns, UsageRow } from './activity-stats';
import {
  activityApps,
  ActivityDeviceRow,
  activityDevices,
  activityProjectRules,
  activitySettings,
  activitySpans,
} from './activity.schema';

const DEFAULT_IDLE_MINUTES = 5;
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

  /** What a tracker has to know: when the user is "away" and what not to record. */
  async config(userId: string): Promise<ActivityDeviceConfig> {
    const excluded = await this.db
      .select({ app: activityApps.app })
      .from(activityApps)
      .where(and(eq(activityApps.userId, userId), eq(activityApps.excluded, true)));
    return {
      idleMinutes: (await this.settings(userId)).idleMinutes,
      excludedApps: excluded.map((row) => row.app),
    };
  }

  // --- Settings ---

  async settings(userId: string): Promise<ActivitySettings> {
    const [row] = await this.db
      .select()
      .from(activitySettings)
      .where(eq(activitySettings.userId, userId));
    return { idleMinutes: row?.idleMinutes ?? DEFAULT_IDLE_MINUTES };
  }

  async saveSettings(userId: string, settings: ActivitySettings): Promise<void> {
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
      .groupBy(day, s.deviceId, s.app, s.title);

    const devices = await this.db
      .select({ id: activityDevices.id, name: activityDevices.name })
      .from(activityDevices)
      .where(eq(activityDevices.userId, userId));
    return buildStats(rows, period, {
      categories: await this.chosenCategories(userId),
      projects: await this.projectPatterns(userId),
      devices,
    });
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
      category: categoryOf(row.app, categories),
      deviceId: row.deviceId,
    }));
  }

  /** Seconds recorded in all time, per category — the metrics of the achievements. */
  async lifetime(
    userId: string,
  ): Promise<{ total: number; byCategory: Map<ActivityCategory, number> }> {
    const rows = await this.db
      .select({ app: activitySpans.app, seconds: sql<number>`sum(${activitySpans.seconds})::int` })
      .from(activitySpans)
      .where(eq(activitySpans.userId, userId))
      .groupBy(activitySpans.app);
    const categories = await this.chosenCategories(userId);
    const byCategory = new Map<ActivityCategory, number>();
    for (const row of rows) {
      const category = categoryOf(row.app, categories);
      byCategory.set(category, (byCategory.get(category) ?? 0) + row.seconds);
    }
    return { total: rows.reduce((sum, row) => sum + row.seconds, 0), byCategory };
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

  private async chosenCategories(userId: string): Promise<Map<string, ActivityCategory | null>> {
    const rows = await this.db
      .select({ app: activityApps.app, category: activityApps.category })
      .from(activityApps)
      .where(eq(activityApps.userId, userId));
    return new Map(rows.map((row) => [row.app, row.category]));
  }

  /** Each project is recognized by its own name and by the user's rules for it. */
  private async projectPatterns(userId: string): Promise<ProjectPatterns[]> {
    const rules = await this.rules(userId);
    return (await this.projectsService.list(userId)).map((project) => ({
      projectId: project.id,
      name: project.name,
      patterns: [
        project.name,
        ...rules.filter((rule) => rule.projectId === project.id).map((rule) => rule.pattern),
      ],
    }));
  }

  private async timeZone(userId: string): Promise<string> {
    return this.users.timeZoneOf(await this.users.findById(userId));
  }
}
