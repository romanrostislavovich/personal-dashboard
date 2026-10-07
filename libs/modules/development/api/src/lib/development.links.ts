import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LinksService, ProjectRef } from '@pd/api-core';
import { ProjectChange, ProjectFact } from '@pd/contracts';
import { and, eq, gte, lte } from 'drizzle-orm';
import { GithubTokenService } from './github/github-token.service';
import { GithubClient } from './github/github.client';
import { trackedRepos } from './open-source/open-source.schema';
import { belongsTo, namesOf } from './project-names';
import { wakatimeDayBreakdown, wakatimeDays } from './wakatime/wakatime.schema';

/** Repositories of a project asked for commits at once: each is a request to GitHub. */
const MAX_REPOS = 3;

/**
 * What development tells the other sections (see LinksService): the coding time and the
 * repositories of a project, the commits and releases before a moment (what changed before a
 * site went down), the coding hours of every day.
 */
@Injectable()
export class DevelopmentLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly github: GithubTokenService,
  ) {}

  onModuleInit(): void {
    this.links.registerProject({
      module: 'development',
      facts: (userId, project, period) => this.facts(userId, project, period),
      changes: (userId, project, from, to) => this.changes(userId, project, from, to),
    });

    this.links.registerDailyMetrics({
      module: 'development',
      metrics: async (userId, { from, to }) => {
        const days = await this.db
          .select({ day: wakatimeDays.day, seconds: wakatimeDays.totalSeconds })
          .from(wakatimeDays)
          .where(
            and(
              eq(wakatimeDays.userId, userId),
              gte(wakatimeDays.day, from),
              lte(wakatimeDays.day, to),
            ),
          );
        return days.length
          ? [
              {
                key: 'development.coding',
                module: 'development',
                labelKey: 'development.links.coding',
                unit: 'hours',
                days: days.map(({ day, seconds }) => ({ day, value: seconds / 3600 })),
              },
            ]
          : [];
      },
    });

    this.links.registerPages([
      { module: 'development', path: '/development/summary', description: 'all code accounts' },
      {
        module: 'development',
        path: '/development/open-source',
        description: 'repositories: stars, issues, releases',
      },
      { module: 'development', path: '/development/wakatime', description: 'coding time' },
    ]);
  }

  private async facts(
    userId: string,
    project: ProjectRef,
    { from, to }: { from: string; to: string },
  ): Promise<ProjectFact[]> {
    const names = namesOf(project);
    const b = wakatimeDayBreakdown;
    const coded = await this.db
      .select({ name: b.name, seconds: b.seconds })
      .from(b)
      .where(and(eq(b.userId, userId), eq(b.kind, 'project'), gte(b.day, from), lte(b.day, to)));
    const seconds = coded
      .filter((row) => belongsTo(row.name, names))
      .reduce((sum, row) => sum + row.seconds, 0);
    const repos = await this.reposOf(userId, names);

    return [
      ...(seconds
        ? [
            {
              module: 'development',
              labelKey: 'development.links.coding',
              value: seconds,
              unit: 'seconds' as const,
              metric: 'codingSeconds' as const,
              link: '/development/wakatime',
            },
          ]
        : []),
      ...(repos.length
        ? [
            {
              module: 'development',
              labelKey: 'development.links.stars',
              value: repos.reduce((sum, repo) => sum + repo.stars, 0),
              unit: 'count' as const,
              link: '/development/open-source',
              note: repos.map((repo) => repo.fullName).join(', '),
            },
          ]
        : []),
    ];
  }

  /** Commits and releases of the project's GitHub repositories between two moments. */
  private async changes(
    userId: string,
    project: ProjectRef,
    from: Date,
    to: Date,
  ): Promise<ProjectChange[]> {
    const repos = (await this.reposOf(userId, namesOf(project))).filter(
      (repo) => repo.provider === 'github',
    );
    if (!repos.length) {
      return [];
    }
    const client = new GithubClient(await this.github.token(userId));
    const changes: ProjectChange[] = [];
    for (const repo of repos.slice(0, MAX_REPOS)) {
      for (const commit of await client.listCommits(repo.fullName, from, to)) {
        changes.push({ module: 'development', where: repo.fullName, ...commit });
      }
      const released = repo.latestReleaseAt;
      if (repo.latestReleaseTag && released && released >= from && released <= to) {
        changes.push({
          module: 'development',
          where: repo.fullName,
          at: released.toISOString(),
          title: `Release ${repo.latestReleaseTag}`,
          url: `${repo.htmlUrl}/releases/tag/${encodeURIComponent(repo.latestReleaseTag)}`,
        });
      }
    }
    return changes.sort((a, b) => b.at.localeCompare(a.at));
  }

  private async reposOf(userId: string, names: string[]) {
    const repos = await this.db.select().from(trackedRepos).where(eq(trackedRepos.userId, userId));
    return repos.filter((repo) => belongsTo(repo.fullName, names));
  }
}
