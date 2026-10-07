import { Injectable } from '@nestjs/common';
import {
  addDays,
  MoodInsights,
  parseLocalDate,
  ProjectFact,
  ProjectMonth,
  ProjectOverview,
  toLocalDate,
  zonedDateTime,
  zonedToUtc,
} from '@pd/contracts';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { LinksService, Period, ProjectRef } from './links.service';
import { moodInsights } from './mood-insights';
import { lastMonths, monthOf } from './project-months';

/** Changes of a project shown in its overview. */
const CHANGES = 15;
const HOUR = 3600;

/** Money for an hour at the project: its income and expenses over the hours worked on it. */
export function perHour(facts: ProjectFact[]): ProjectOverview['perHour'] {
  const of = (metric: ProjectFact['metric']) => facts.filter((fact) => fact.metric === metric);
  // The tracker and the IDE count the same hours from two sides: the larger is nearer the truth.
  const seconds = Math.max(
    ...[...of('seconds'), ...of('codingSeconds')].map((fact) => fact.value),
    0,
  );
  const currency = [...of('income'), ...of('expense')][0]?.currency;
  if (seconds < HOUR || !currency) {
    return null;
  }
  const total = (metric: 'income' | 'expense') =>
    of(metric)
      .filter((fact) => fact.currency === currency)
      .reduce((sum, fact) => sum + fact.value, 0);
  const hours = seconds / HOUR;
  return {
    income: Math.round((total('income') / hours) * 100) / 100,
    expense: Math.round((total('expense') / hours) * 100) / 100,
    currency,
  };
}

/** What the sections know together: a project across them, the days in numbers. */
@Injectable()
export class ProjectOverviewService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly links: LinksService,
    private readonly users: UsersService,
  ) {}

  /** A project as the sections are asked about it; throws when it is not the user's. */
  async ref(userId: string, projectId: string): Promise<ProjectRef> {
    const { id, name, url, aliases } = await this.projects.get(userId, projectId);
    return { id, name, url, aliases };
  }

  async overview(userId: string, projectId: string, period: Period): Promise<ProjectOverview> {
    const project = await this.ref(userId, projectId);
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
    const [facts, changes] = await Promise.all([
      this.links.projectFacts(userId, project, period),
      this.links.projectChanges(
        userId,
        project,
        zonedToUtc({ date: period.from, time: '00:00' }, timeZone),
        zonedToUtc({ date: after, time: '00:00' }, timeZone),
      ),
    ]);
    return {
      project,
      ...period,
      facts,
      changes: changes.slice(0, CHANGES),
      perHour: perHour(facts),
    };
  }

  /** The project month by month, oldest first: its hours and its money. */
  async months(userId: string, projectId: string, count: number): Promise<ProjectMonth[]> {
    const project = await this.ref(userId, projectId);
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    const today = zonedDateTime(new Date(), timeZone).date;
    const months: ProjectMonth[] = [];
    for (const { month, from, to } of lastMonths(today, count)) {
      months.push(monthOf(month, await this.links.projectFacts(userId, project, { from, to })));
    }
    return months;
  }

  /** What goes with the days of a good mood and of a bad one (see moodInsights). */
  async moodInsights(userId: string, period: Period): Promise<MoodInsights> {
    return moodInsights(await this.links.dailyMetrics(userId, period), period);
  }
}
