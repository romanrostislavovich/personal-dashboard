import {Inject, Injectable} from '@nestjs/common';
import {
  DB,
  Database,
  OtherComputersService,
  ProjectRef,
  ProjectsService,
} from '@pd/api-core';
import {
  ACTIVITY_DISTRACTING_CATEGORIES,
  ActivityPeriod,
  ActivityStats,
  isSiteOf,
  LocalDate,
  toLocalDate,
} from '@pd/contracts';
import {and, eq, gt, gte, lt, min} from 'drizzle-orm';
import {categoryOf, matchProject} from './activity-stats';
import {activitySiteVisits, activitySpans} from './activity.schema';
import {ActivityService} from './activity.service';
import {ProjectTime, projectTime, WorkPiece} from './project-context';
import {
  dayBounds,
  mergeSpans,
  monthsBetween,
  secondsByDay,
  spanSeconds,
  TimeSpan,
} from './time-spans';
import {MAX_VISIT_SECONDS} from './visit-length';

/** The time of a project in a period, in the numbers the overview of a project shows. */
export interface ProjectTimeFact {
  seconds: number;
  days: {day: LocalDate; seconds: number}[];
  /** Of it: what only what is around work on it gives (see projectTime). */
  fromContext: number;
  /** Of it: what only the IDE of WakaTime gives. */
  fromCoding: number;
}

/**
 * The time of a project at the computer, all of it: the windows and sites its name or a rule
 * names, the IDE on any computer (WakaTime), and the windows and sites in between (see
 * project-context.ts) — by the clock, what overlaps counted once.
 */
@Injectable()
export class ProjectTimeService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly activity: ActivityService,
    private readonly others: OtherComputersService,
    private readonly projects: ProjectsService,
  ) {}

  /**
   * The statistics with the time of every project counted this way, not by window titles
   * alone. One computer of the tracker asked for keeps its own: the others are not its time.
   */
  async withProjects(
    userId: string,
    period: ActivityPeriod,
    stats: ActivityStats,
  ): Promise<ActivityStats> {
    if (period.deviceId) {
      return stats;
    }
    const bounds = dayBounds(period, await this.activity.timeZone(userId));
    const spans = await this.byProject(userId, bounds);
    const projects = (await this.projects.list(userId)).flatMap(project => {
      const time = spans.get(project.id) ?? [];
      const seconds = spanSeconds(time);
      const days = [...secondsByDay(time, bounds)].map(([day, value]) => ({
        day,
        seconds: value,
      }));
      return seconds
        ? [{projectId: project.id, name: project.name, seconds, days}]
        : [];
    });
    return {...stats, projects: projects.sort((a, b) => b.seconds - a.seconds)};
  }

  /**
   * All the time ever spent on any project, what two projects share counted once — for the
   * achievements. Read month by month, so a long history is never held at once.
   */
  async allTimeSeconds(userId: string): Promise<number> {
    const first = await this.firstMoment(userId);
    if (!first) {
      return 0;
    }
    const timeZone = await this.activity.timeZone(userId);
    const today = await this.activity.today(userId);
    let total = 0;
    for (const {from, to} of monthsBetween(
      toLocalDate(dateParts(first, timeZone)),
      today,
    )) {
      const spans = await this.byProject(
        userId,
        dayBounds({from, to}, timeZone),
      );
      total += spanSeconds([...spans.values()].flat());
    }
    return total;
  }

  /** The time of each project between the beginning of the first day and the end of the last. */
  private async byProject(
    userId: string,
    bounds: {start: number; end: number}[],
  ): Promise<Map<string, TimeSpan[]>> {
    const from = new Date(bounds[0].start);
    const to = new Date(bounds[bounds.length - 1].end);
    const pieces = await this.pieces(userId, from, to);
    const byProject = new Map<string, TimeSpan[]>();
    for (const project of await this.projects.list(userId)) {
      const coding = await this.others.projectSpans(userId, project, from, to);
      const time = projectTime(
        pieces,
        project.id,
        coding.map(({startedAt, endedAt}) => ({
          start: startedAt.getTime(),
          end: endedAt.getTime(),
        })),
      );
      if (time.spans.length) {
        byProject.set(project.id, mergeSpans(time.spans));
      }
    }
    return byProject;
  }

  /** When the tracker or the browser recorded anything first. */
  private async firstMoment(userId: string): Promise<Date | null> {
    const [spans] = await this.db
      .select({at: min(activitySpans.startedAt)})
      .from(activitySpans)
      .where(eq(activitySpans.userId, userId));
    const [visits] = await this.db
      .select({at: min(activitySiteVisits.startedAt)})
      .from(activitySiteVisits)
      .where(eq(activitySiteVisits.userId, userId));
    const moments = [spans?.at, visits?.at].filter((at): at is Date => !!at);
    return moments.length
      ? new Date(Math.min(...moments.map(at => at.getTime())))
      : null;
  }

  async fact(
    userId: string,
    project: ProjectRef,
    period: {from: LocalDate; to: LocalDate},
  ): Promise<ProjectTimeFact> {
    const timeZone = await this.activity.timeZone(userId);
    const bounds = dayBounds(period, timeZone);
    const time = await this.time(userId, project, bounds);
    return {
      seconds: spanSeconds(time.spans),
      days: [...secondsByDay(time.spans, bounds)].map(([day, seconds]) => ({
        day,
        seconds,
      })),
      fromContext: spanSeconds(time.fromContext),
      fromCoding: spanSeconds(time.fromCoding),
    };
  }

  /** The time of a project between the beginning of the first day and the end of the last. */
  async time(
    userId: string,
    project: ProjectRef,
    bounds: {start: number; end: number}[],
  ): Promise<ProjectTime> {
    const from = new Date(bounds[0].start);
    const to = new Date(bounds[bounds.length - 1].end);
    const [pieces, coding] = await Promise.all([
      this.pieces(userId, from, to),
      this.others.projectSpans(userId, project, from, to),
    ]);
    return projectTime(
      pieces,
      project.id,
      coding.map(({startedAt, endedAt}) => ({
        start: startedAt.getTime(),
        end: endedAt.getTime(),
      })),
    );
  }

  /** Every window of the tracker and every site of the browser between two moments, known. */
  async pieces(userId: string, from: Date, to: Date): Promise<WorkPiece[]> {
    const s = activitySpans;
    const v = activitySiteVisits;
    const [windows, visits, projects, chosen, settings] = await Promise.all([
      this.db
        .select({
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          app: s.app,
          title: s.title,
        })
        .from(s)
        .where(
          and(
            eq(s.userId, userId),
            gte(s.startedAt, from),
            lt(s.startedAt, to),
          ),
        ),
      this.db
        .select({startedAt: v.startedAt, endedAt: v.endedAt, site: v.site})
        .from(v)
        .where(
          and(
            eq(v.userId, userId),
            lt(v.startedAt, to),
            gt(v.endedAt, from),
            // A visit is never longer than this: the index on its start is used from here.
            gte(
              v.startedAt,
              new Date(from.getTime() - MAX_VISIT_SECONDS * 1000),
            ),
          ),
        ),
      this.activity.projectPatterns(userId),
      this.activity.chosenCategories(userId),
      this.activity.settings(userId),
    ]);
    return [
      ...windows.map((row): WorkPiece => ({
        start: row.startedAt.getTime(),
        end: row.endedAt.getTime(),
        kind: 'window',
        app: row.app,
        label: row.title,
        projectId: matchProject(row.title, projects),
        leisure: ACTIVITY_DISTRACTING_CATEGORIES.includes(
          categoryOf(row.app, chosen, row.title),
        ),
      })),
      ...visits.map((row): WorkPiece => ({
        start: row.startedAt.getTime(),
        end: row.endedAt.getTime(),
        kind: 'site',
        app: null,
        label: row.site,
        projectId: matchProject(row.site, projects),
        leisure: settings.distractingSites.some(site =>
          isSiteOf(row.site, site),
        ),
      })),
    ];
  }
}

/** The date of a moment on the user's clock. */
function dateParts(at: Date, timeZone: string) {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {timeZone})
    .format(at)
    .split('-')
    .map(Number);
  return {year, month, day};
}
