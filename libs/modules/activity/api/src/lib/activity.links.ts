import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LinksService } from '@pd/api-core';
import {
  ActivityFocusMusic,
  ActivityPeriod,
  addDays,
  DailyMetric,
  LocalDate,
  parseLocalDate,
  ProjectFact,
  toLocalDate,
  zonedToUtc,
} from '@pd/contracts';
import { and, asc, eq, gt, gte, isNotNull, lt, sql } from 'drizzle-orm';
import {
  activityDevices,
  activityFocusSessions,
  activityOutages,
  activitySiteVisits,
} from './activity.schema';
import { ActivityService } from './activity.service';
import { ProjectTimeService } from './project-time.service';
import { focusMusic, FocusWithPlays, timeByName, timeByTitle } from './focus-music';
import { WellbeingService } from './wellbeing.service';
import { TelemetrySummaryService } from './telemetry-summary.service';
import { telemetryDailyMetrics } from './telemetry-summary.views';

/** The sites that get a daily number of their own, and the days one needs. */
const SITES = 6;
const SITE_MIN_DAYS = 10;

const HOUR = 3600;
/** Windows named after a task are looked for this far back. */
const TITLE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Focus sessions asked about their music at once: each is a question to the other sections. */
const MAX_SESSIONS = 200;
/** A name shorter than this would be found inside any other word. */
const MIN_NAME = 4;

/**
 * What activity tells the other sections (see LinksService): the time of a project, the focus
 * time of a task, the hours of every day, whether a program that is paid for is opened — and
 * what it asks them: the music that played during a focus session.
 */
@Injectable()
export class ActivityLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly activity: ActivityService,
    private readonly wellbeing: WellbeingService,
    private readonly telemetry: TelemetrySummaryService,
    private readonly projectTime: ProjectTimeService,
  ) {}

  onModuleInit(): void {
    this.links.registerDailyMetrics({
      module: 'activity',
      metrics: async (userId, period) =>
        telemetryDailyMetrics(await this.telemetry.summarize(userId, period)),
    });
    this.links.registerProject({
      module: 'activity',
      facts: async (userId, project, period): Promise<ProjectFact[]> => {
        const time = await this.projectTime.fact(userId, project, period);
        const focus = await this.wellbeing.focusStats(userId, period);
        const seconds = time.seconds;
        const focused = focus.projects.find((item) => item.projectId === project.id)?.seconds;
        return [
          ...(seconds
            ? [
                {
                  module: 'activity',
                  labelKey: 'activity.links.time',
                  value: seconds,
                  unit: 'seconds' as const,
                  metric: 'seconds' as const,
                  days: time.days,
                  ...(time.fromContext ? { fromContext: time.fromContext } : {}),
                  ...(time.fromCoding ? { fromCoding: time.fromCoding } : {}),
                  link: '/activity/overview',
                },
              ]
            : []),
          ...(focused
            ? [
                {
                  module: 'activity',
                  labelKey: 'activity.links.focus',
                  value: focused,
                  unit: 'seconds' as const,
                  link: '/activity/focus',
                },
              ]
            : []),
        ];
      },
    });

    this.links.registerTimeSpent({
      module: 'activity',
      kind: 'windows',
      spent: async (userId, names) =>
        timeByTitle(
          await this.activity.titleSeconds(userId, new Date(Date.now() - TITLE_DAYS * DAY_MS)),
          names,
        ),
    });

    // Times a computer could not reach the internet or the server: what a site that "went
    // down" then may really have been.
    this.links.registerMoments({
      module: 'activity',
      between: async (userId, from, to) => {
        const o = activityOutages;
        const outages = await this.db
          .select({
            kind: o.kind,
            startedAt: o.startedAt,
            endedAt: o.endedAt,
            device: activityDevices.name,
          })
          .from(o)
          .innerJoin(activityDevices, eq(activityDevices.id, o.deviceId))
          .where(and(eq(o.userId, userId), lt(o.startedAt, to), gt(o.endedAt, from)))
          .orderBy(asc(o.startedAt));
        return outages.map((outage) => ({
          module: 'activity',
          kind: 'outage',
          at: outage.startedAt.toISOString(),
          until: outage.endedAt.toISOString(),
          title: outage.kind,
          subtitle: outage.device,
        }));
      },
    });

    this.links.registerTimeSpent({
      module: 'activity',
      kind: 'focus',
      spent: async (userId, names) => {
        const s = activityFocusSessions;
        const sessions = await this.db
          .select({ note: s.note, focusSeconds: s.focusSeconds })
          .from(s)
          .where(and(eq(s.userId, userId), isNotNull(s.note)));
        return timeByName(sessions, names);
      },
    });

    this.links.registerDailyMetrics({
      module: 'activity',
      metrics: async (userId, period) => {
        const stats = await this.activity.stats(userId, period);
        if (!stats.totalSeconds) {
          // No tracker on the computer: the browser's sites may still be known.
          return this.sites(userId, period);
        }
        const focus = await this.wellbeing.focusStats(userId, period);
        const games = await this.activity.gamesByDay(userId, period);
        const lateGames = await this.activity.gamesByDay(userId, period, { late: true });
        const bounds = await this.activity.dayBounds(userId, period);
        const hours = (days: { day: string; seconds: number }[]) =>
          days
            .filter((day) => day.seconds > 0)
            .map(({ day, seconds }) => ({ day, value: seconds / HOUR }));
        return [
          {
            key: 'activity.hours',
            module: 'activity',
            labelKey: 'activity.links.hours',
            unit: 'hours' as const,
            days: hours(stats.days),
          },
          {
            key: 'activity.games',
            module: 'activity',
            labelKey: 'activity.links.games',
            unit: 'hours' as const,
            days: hours([...games].map(([day, seconds]) => ({ day, seconds }))),
          },
          ...(await this.sites(userId, period)),
          {
            key: 'activity.lateGames',
            module: 'activity',
            labelKey: 'activity.links.lateGames',
            unit: 'hours' as const,
            partOf: 'activity.games',
            days: hours([...lateGames].map(([day, seconds]) => ({ day, seconds }))),
          },
          {
            key: 'activity.focus',
            module: 'activity',
            labelKey: 'activity.links.focus',
            unit: 'hours' as const,
            days: hours(focus.days),
          },
          {
            key: 'activity.firstUse',
            module: 'activity',
            labelKey: 'activity.links.firstUse',
            unit: 'clock' as const,
            days: bounds.map(({ day, first }) => ({ day, value: first })),
          },
          {
            key: 'activity.lastUse',
            module: 'activity',
            labelKey: 'activity.links.lastUse',
            unit: 'clock' as const,
            days: bounds.map(({ day, last }) => ({ day, value: last })),
          },
        ].filter((metric) => metric.days.length > 0);
      },
    });

    this.links.registerUsage({
      module: 'activity',
      usage: async (userId, name, period) => {
        // "ChatGPT Plus" is paid for, "ChatGPT" is what is open: the first word counts too.
        const wanted = [name, name.split(/\s+/)[0]].filter((word) => word.length >= MIN_NAME);
        const fits = (text: string) => {
          const lower = text.toLowerCase();
          return wanted.some(
            (word) => lower.includes(word) || (lower.length >= MIN_NAME && word.includes(lower)),
          );
        };
        const stats = await this.activity.stats(userId, period);
        const apps = stats.apps.filter((app) => fits(app.name) || fits(app.app));
        // In a browser the service is a window title, not a program.
        const titles = stats.titles.filter(
          (title) => fits(title.title) && !apps.some((app) => app.app === title.app),
        );
        const seconds = [...apps, ...titles].reduce((sum, item) => sum + item.seconds, 0);
        if (!seconds) {
          // Never opened lately — but only a program seen before is known to be one.
          const known = (await this.activity.apps(userId)).some((app) => fits(app.name));
          return known ? { unitKey: 'activity.usage.seconds', amount: 0, lastUsedAt: null } : null;
        }
        return { unitKey: 'activity.usage.seconds', amount: seconds, lastUsedAt: null };
      },
    });

    this.links.registerPages([
      { module: 'activity', path: '/activity/overview', description: 'time at the computer' },
      { module: 'activity', path: '/activity/focus', description: 'focus sessions, their music' },
      { module: 'activity', path: '/activity/computers', description: 'health of the computers' },
    ]);
  }

  /** Focus with music against focus in silence over a period (see focusMusic). */
  async focusMusic(userId: string, period: ActivityPeriod): Promise<ActivityFocusMusic> {
    const { sessions } = await this.wellbeing.focusStats(userId, period);
    const withPlays: FocusWithPlays[] = [];
    for (const session of sessions.slice(0, MAX_SESSIONS)) {
      const moments = await this.links.momentsBetween(
        userId,
        new Date(session.startedAt),
        new Date(session.endedAt),
      );
      withPlays.push({
        completed: session.completed,
        focusSeconds: session.focusSeconds,
        distractedSeconds: session.distractions.reduce((sum, item) => sum + item.seconds, 0),
        project: session.projectName,
        artists: moments
          .filter((moment) => moment.kind === 'play')
          .map((moment) => moment.subtitle ?? moment.title),
      });
    }
    return focusMusic(withPlays);
  }

  /**
   * The time in the browser of every day (the extension's), and on each of the sites most
   * often open — a part of it.
   */
  private async sites(userId: string, period: ActivityPeriod): Promise<DailyMetric[]> {
    const timeZone = await this.activity.timeZone(userId);
    const v = activitySiteVisits;
    const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
    const rows = await this.db
      .select({
        day: sql<LocalDate>`to_char(${v.startedAt} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`,
        site: v.site,
        seconds: sql<number>`sum(${v.seconds})::int`,
      })
      .from(v)
      .where(
        and(
          eq(v.userId, userId),
          gte(v.startedAt, zonedToUtc({ date: period.from, time: '00:00' }, timeZone)),
          lt(v.startedAt, zonedToUtc({ date: after, time: '00:00' }, timeZone)),
        ),
      )
      // By position: the time zone is a parameter (see ActivityService.stats).
      .groupBy(sql`1`, v.site);
    if (!rows.length) {
      return [];
    }
    const total = new Map<LocalDate, number>();
    const bySite = new Map<string, Map<LocalDate, number>>();
    for (const row of rows) {
      total.set(row.day, (total.get(row.day) ?? 0) + row.seconds);
      const days = bySite.get(row.site) ?? new Map<LocalDate, number>();
      days.set(row.day, row.seconds);
      bySite.set(row.site, days);
    }
    const hours = (days: Map<LocalDate, number>, all: Iterable<LocalDate>) =>
      [...all].map((day) => ({ day, value: (days.get(day) ?? 0) / 3600 }));
    // The sites open on the most days: a rare one has too few days to compare.
    const top = [...bySite]
      .filter(([, days]) => days.size >= SITE_MIN_DAYS)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, SITES);
    return [
      {
        key: 'activity.browser',
        module: 'activity',
        labelKey: 'activity.links.browser',
        unit: 'hours',
        days: hours(total, total.keys()),
      },
      ...top.map(([site, days]) => ({
        key: `activity.site.${site}`,
        module: 'activity',
        labelKey: 'activity.links.site',
        label: site,
        unit: 'hours' as const,
        partOf: 'activity.browser',
        days: hours(days, total.keys()),
      })),
    ];
  }
}
