import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database } from '@pd/api-core';
import { todayIn, toLocalDate } from '@pd/contracts';
import { eq, sql } from 'drizzle-orm';
import { GithubClient, GithubIssue } from '../github/github.client';
import { RepoSnapshot } from './github-repos.client';
import { fetchNpmWeeklyDownloads } from './npm.client';
import { repoDailyStats, TrackedRepoRow, trackedRepos } from './open-source.schema';
import { crossedStarMilestone } from './star-stats';

/** What happened to the repository since the last sync — for notifications. */
export interface RepoSyncEvents {
  fullName: string;
  newIssues: GithubIssue[];
  newPulls: GithubIssue[];
  newRelease: { tag: string; htmlUrl: string } | null;
  starMilestone: number | null;
}

/**
 * Saves the fresh data of one repository: the current figures and the daily history.
 * Returns events for the repositories the user asked to be told about.
 */
@Injectable()
export class RepoSyncService {
  private readonly logger = new Logger(RepoSyncService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  async apply(
    repo: TrackedRepoRow,
    snapshot: RepoSnapshot,
    github: GithubClient,
  ): Promise<RepoSyncEvents | null> {
    // A package set by hand wins over the one in package.json (`null` — "it has none").
    const npmPackage = repo.npmPackageManual ? repo.npmPackage : snapshot.packageName;
    const stats = {
      stars: snapshot.stars,
      forks: snapshot.forks,
      openIssues: snapshot.openIssues,
      openPulls: snapshot.openPulls,
      npmWeeklyDownloads: npmPackage ? await this.npmDownloads(npmPackage, repo) : null,
    };
    const release = snapshot.latestRelease;

    await this.db
      .update(trackedRepos)
      .set({
        ...stats,
        npmPackage,
        externalId: snapshot.externalId,
        fullName: snapshot.fullName,
        htmlUrl: snapshot.htmlUrl,
        description: snapshot.description,
        language: snapshot.language,
        isFork: snapshot.isFork,
        isArchived: snapshot.isArchived,
        pushedAt: snapshot.pushedAt ? new Date(snapshot.pushedAt) : null,
        latestReleaseTag: release?.tag ?? null,
        latestReleaseAt: release ? new Date(release.publishedAt) : null,
        lastSyncedAt: new Date(),
        syncError: null,
      })
      .where(eq(trackedRepos.id, repo.id));

    const day = toLocalDate(todayIn(this.config.get('APP_TIMEZONE', { infer: true })));
    await this.db
      .insert(repoDailyStats)
      .values({ repoId: repo.id, day, ...stats })
      .onConflictDoUpdate({
        target: [repoDailyStats.repoId, repoDailyStats.day],
        set: stats,
        // Dozens of repositories are saved every hour: a day that did not change stays
        // untouched, otherwise each row would be sent again by the sync between instances.
        setWhere: sql`(${repoDailyStats.stars}, ${repoDailyStats.forks}, ${repoDailyStats.openIssues}, ${repoDailyStats.openPulls}, ${repoDailyStats.npmWeeklyDownloads})
          IS DISTINCT FROM (excluded.stars, excluded.forks, excluded.open_issues, excluded.open_pulls, excluded.npm_weekly_downloads)`,
      });

    // On the first sync there is nothing to compare with — and no flood about old issues.
    if (!repo.notify || !repo.lastSyncedAt) {
      return null;
    }
    const created = await github.listCreatedSince(snapshot.fullName, repo.lastSyncedAt);
    return {
      fullName: snapshot.fullName,
      newIssues: created.filter((item) => !item.isPullRequest),
      newPulls: created.filter((item) => item.isPullRequest),
      newRelease: release && release.tag !== repo.latestReleaseTag ? release : null,
      starMilestone: crossedStarMilestone(repo.stars, snapshot.stars),
    };
  }

  async markFailed(repo: TrackedRepoRow, error: unknown): Promise<void> {
    await this.db
      .update(trackedRepos)
      .set({ syncError: error instanceof Error ? error.message : String(error) })
      .where(eq(trackedRepos.id, repo.id));
  }

  /** npm being down must not fail the repository: the last known figure stays. */
  private async npmDownloads(npmPackage: string, repo: TrackedRepoRow): Promise<number | null> {
    try {
      return await fetchNpmWeeklyDownloads(npmPackage);
    } catch (error) {
      this.logger.warn(`npm downloads of ${npmPackage} failed: ${error}`);
      return repo.npmPackage === npmPackage ? repo.npmWeeklyDownloads : null;
    }
  }
}
