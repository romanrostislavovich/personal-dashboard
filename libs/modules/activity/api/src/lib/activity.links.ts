import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LinksService } from '@pd/api-core';
import { ActivityFocusMusic, ActivityPeriod, ProjectFact } from '@pd/contracts';
import { and, eq, isNotNull } from 'drizzle-orm';
import { activityFocusSessions } from './activity.schema';
import { ActivityService } from './activity.service';
import { focusMusic, FocusWithPlays, timeByName } from './focus-music';
import { WellbeingService } from './wellbeing.service';

const HOUR = 3600;
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
  ) {}

  onModuleInit(): void {
    this.links.registerProject({
      module: 'activity',
      facts: async (userId, project, period): Promise<ProjectFact[]> => {
        const stats = await this.activity.stats(userId, period);
        const focus = await this.wellbeing.focusStats(userId, period);
        const seconds = stats.projects.find((item) => item.projectId === project.id)?.seconds;
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
          return [];
        }
        const focus = await this.wellbeing.focusStats(userId, period);
        const games = await this.activity.gamesByDay(userId, period);
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
          {
            key: 'activity.focus',
            module: 'activity',
            labelKey: 'activity.links.focus',
            unit: 'hours' as const,
            days: hours(focus.days),
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
        artists: moments
          .filter((moment) => moment.kind === 'play')
          .map((moment) => moment.subtitle ?? moment.title),
      });
    }
    return focusMusic(withPlays);
  }
}
