import { Inject, Injectable } from '@nestjs/common';
import { DB, Database, OtherComputersService, ProjectRef } from '@pd/api-core';
import { ACTIVITY_DISTRACTING_CATEGORIES, isSiteOf, LocalDate } from '@pd/contracts';
import { and, eq, gt, gte, lt } from 'drizzle-orm';
import { categoryOf, matchProject } from './activity-stats';
import { activitySiteVisits, activitySpans } from './activity.schema';
import { ActivityService } from './activity.service';
import { ProjectTime, projectTime, WorkPiece } from './project-context';
import { dayBounds, secondsByDay, spanSeconds } from './time-spans';

/** The time of a project in a period, in the numbers the overview of a project shows. */
export interface ProjectTimeFact {
  seconds: number;
  days: { day: LocalDate; seconds: number }[];
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
  ) {}

  async fact(
    userId: string,
    project: ProjectRef,
    period: { from: LocalDate; to: LocalDate },
  ): Promise<ProjectTimeFact> {
    const timeZone = await this.activity.timeZone(userId);
    const bounds = dayBounds(period, timeZone);
    const time = await this.time(userId, project, bounds);
    return {
      seconds: spanSeconds(time.spans),
      days: [...secondsByDay(time.spans, bounds)].map(([day, seconds]) => ({ day, seconds })),
      fromContext: spanSeconds(time.fromContext),
      fromCoding: spanSeconds(time.fromCoding),
    };
  }

  /** The time of a project between the beginning of the first day and the end of the last. */
  async time(
    userId: string,
    project: ProjectRef,
    bounds: { start: number; end: number }[],
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
      coding.map(({ startedAt, endedAt }) => ({
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
        .select({ startedAt: s.startedAt, endedAt: s.endedAt, app: s.app, title: s.title })
        .from(s)
        .where(and(eq(s.userId, userId), gte(s.startedAt, from), lt(s.startedAt, to))),
      this.db
        .select({ startedAt: v.startedAt, endedAt: v.endedAt, site: v.site })
        .from(v)
        .where(and(eq(v.userId, userId), lt(v.startedAt, to), gt(v.endedAt, from))),
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
        leisure: ACTIVITY_DISTRACTING_CATEGORIES.includes(categoryOf(row.app, chosen, row.title)),
      })),
      ...visits.map((row): WorkPiece => ({
        start: row.startedAt.getTime(),
        end: row.endedAt.getTime(),
        kind: 'site',
        app: null,
        label: row.site,
        projectId: matchProject(row.site, projects),
        leisure: settings.distractingSites.some((site) => isSiteOf(row.site, site)),
      })),
    ];
  }
}
