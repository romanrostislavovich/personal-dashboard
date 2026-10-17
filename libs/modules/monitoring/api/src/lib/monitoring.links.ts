import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LinksService, ProjectOverviewService, UsersService } from '@pd/api-core';
import {
  addDays,
  DailyMetric,
  LocalDate,
  Moment,
  parseLocalDate,
  ProjectChange,
  ProjectFact,
  toLocalDate,
  zonedDateTime,
  zonedToUtc,
} from '@pd/contracts';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { checkResults, monitors } from './monitoring.schema';
import { Incident, incidentsOf } from './state/incidents';

const HOUR_MS = 60 * 60 * 1000;
/** A change this long before a site went down may be what broke it. */
const SUSPECT_HOURS = 24;
/** Incidents told with their changes at once: each asks the code hosting. */
const MAX_INCIDENTS = 10;
const MAX_CHANGES = 5;
const DAY_MS = 24 * HOUR_MS;
/** An outage of a computer this close to an incident is told with it. */
const OUTAGE_SLACK_MS = 10 * 60 * 1000;

/** An incident of a site with what changed in the project's code shortly before it. */
export interface IncidentReport {
  projectId: string;
  url: string;
  from: string;
  /** `null` — still down. */
  to: string | null;
  downMinutes: number | null;
  /** Commits and releases in the day before it, the nearest to it first. */
  changesBefore: ProjectChange[];
  /**
   * Times the user's own computers could not reach the internet (`title: internet`) or the
   * dashboard's server (`server`) around the incident, as the desktop app saw them: a second
   * witness. The sites are checked from the server, so an outage of the internet at home does
   * not explain an incident — but the server unreachable from a computer at the same time
   * says the trouble was real and wider than one site.
   */
  outages: Moment[];
}

/**
 * Monitoring and the other sections (see LinksService): the uptime of a project's sites for its
 * overview, what changed in the code before a site went down, and the minutes the sites were
 * down on every day (a day of an incident is a day of its own for the links of Life).
 */
@Injectable()
export class MonitoringLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly overviews: ProjectOverviewService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.links.registerProject({
      module: 'monitoring',
      facts: async (userId, project, period) => {
        const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
        const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
        const history = await this.history(
          userId,
          zonedToUtc({ date: period.from, time: '00:00' }, timeZone),
          zonedToUtc({ date: after, time: '00:00' }, timeZone),
          project.id,
        );
        const checks = history.flatMap((site) => site.checks);
        if (!checks.length) {
          return [];
        }
        const up = checks.filter((check) => check.isUp).length;
        return [
          ...(await this.sslFact(userId, project.id)),
          {
            module: 'monitoring',
            labelKey: 'monitoring.links.uptime',
            value: Math.round((up / checks.length) * 10000) / 100,
            unit: 'percent',
            link: '/monitoring',
            note: history.map((site) => site.url).join(', '),
          },
          {
            module: 'monitoring',
            labelKey: 'monitoring.links.incidents',
            value: history.reduce((sum, site) => sum + incidentsOf(site.checks).length, 0),
            unit: 'count',
            link: '/monitoring',
          },
        ];
      },
    });
    this.links.registerDailyMetrics({
      module: 'monitoring',
      metrics: (userId, period) => this.downDays(userId, period),
    });

    this.links.registerPages([
      { module: 'monitoring', path: '/monitoring', description: 'sites: uptime, response, SSL' },
    ]);
  }

  /**
   * The incidents of the last days, newest first, each with the commits and releases of its
   * project in the day before it. The check history is kept for about a month.
   */
  async incidents(userId: string, days: number): Promise<IncidentReport[]> {
    const now = new Date();
    const history = await this.history(userId, new Date(now.getTime() - days * 24 * HOUR_MS), now);
    const found = history
      .flatMap((site) => incidentsOf(site.checks).map((incident) => ({ site, incident })))
      .sort((a, b) => b.incident.from.getTime() - a.incident.from.getTime())
      .slice(0, MAX_INCIDENTS);
    const reports: IncidentReport[] = [];
    for (const { site, incident } of found) {
      reports.push({
        projectId: site.projectId,
        url: site.url,
        from: incident.from.toISOString(),
        to: incident.to?.toISOString() ?? null,
        downMinutes: minutesOf(incident),
        changesBefore: await this.changesBefore(userId, site.projectId, incident.from),
        outages: (
          await this.links.momentsBetween(
            userId,
            new Date(incident.from.getTime() - OUTAGE_SLACK_MS),
            new Date((incident.to ?? now).getTime() + OUTAGE_SLACK_MS),
          )
        ).filter((moment) => moment.kind === 'outage'),
      });
    }
    return reports;
  }

  /** The days left of the certificate that expires first among the project's sites. */
  private async sslFact(userId: string, projectId: string): Promise<ProjectFact[]> {
    const sites = await this.db
      .select({ url: monitors.url, expiresAt: monitors.sslExpiresAt })
      .from(monitors)
      .where(and(eq(monitors.userId, userId), eq(monitors.projectId, projectId)));
    const [first] = sites
      .flatMap((site) => (site.expiresAt ? [{ url: site.url, expiresAt: site.expiresAt }] : []))
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
    return first
      ? [
          {
            module: 'monitoring',
            labelKey: 'monitoring.links.sslDays',
            value: Math.floor((first.expiresAt.getTime() - Date.now()) / DAY_MS),
            unit: 'count',
            link: '/monitoring',
            note: first.url,
          },
        ]
      : [];
  }

  /** What changed in the project's code in the day before a moment, the nearest first. */
  async changesBefore(userId: string, projectId: string, moment: Date): Promise<ProjectChange[]> {
    const project = await this.overviews.ref(userId, projectId);
    const since = new Date(moment.getTime() - SUSPECT_HOURS * HOUR_MS);
    return (await this.links.projectChanges(userId, project, since, moment)).slice(0, MAX_CHANGES);
  }

  /** The minutes all the sites were down, on the day each incident began. */
  private async downDays(
    userId: string,
    period: { from: LocalDate; to: LocalDate },
  ): Promise<DailyMetric[]> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
    const sites = await this.history(
      userId,
      zonedToUtc({ date: period.from, time: '00:00' }, timeZone),
      zonedToUtc({ date: after, time: '00:00' }, timeZone),
    );
    const checked = sites.flatMap((site) => site.checks);
    if (!checked.length) {
      return [];
    }
    // Every day a check was made is a day of zero unless something went down.
    const days = new Map<LocalDate, number>();
    for (const check of checked) {
      days.set(zonedDateTime(check.checkedAt, timeZone).date, 0);
    }
    for (const site of sites) {
      for (const incident of incidentsOf(site.checks)) {
        const day = zonedDateTime(incident.from, timeZone).date;
        // Still down: until now.
        const minutes =
          minutesOf(incident) ?? Math.round((Date.now() - incident.from.getTime()) / 60_000);
        days.set(day, (days.get(day) ?? 0) + minutes);
      }
    }
    return [
      {
        key: 'monitoring.downMinutes',
        module: 'monitoring',
        labelKey: 'monitoring.links.downMinutes',
        unit: 'count',
        days: [...days].map(([day, value]) => ({ day, value })),
      },
    ];
  }

  /** The checks of the user's sites between two moments, oldest first, per site. */
  private async history(userId: string, from: Date, to: Date, projectId?: string) {
    const sites = await this.db
      .select({ id: monitors.id, url: monitors.url, projectId: monitors.projectId })
      .from(monitors)
      .where(
        and(eq(monitors.userId, userId), projectId ? eq(monitors.projectId, projectId) : undefined),
      );
    if (!sites.length) {
      return [];
    }
    const checks = await this.db
      .select({
        monitorId: checkResults.monitorId,
        checkedAt: checkResults.checkedAt,
        isUp: checkResults.isUp,
      })
      .from(checkResults)
      .where(
        and(
          inArray(
            checkResults.monitorId,
            sites.map((site) => site.id),
          ),
          gte(checkResults.checkedAt, from),
          lt(checkResults.checkedAt, to),
        ),
      )
      .orderBy(asc(checkResults.checkedAt));
    return sites.map((site) => ({
      ...site,
      checks: checks.filter((check) => check.monitorId === site.id),
    }));
  }
}

function minutesOf(incident: Incident): number | null {
  return incident.to
    ? Math.max(1, Math.round((incident.to.getTime() - incident.from.getTime()) / 60_000))
    : null;
}
