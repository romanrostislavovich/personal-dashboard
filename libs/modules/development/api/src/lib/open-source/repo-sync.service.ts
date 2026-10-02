import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database } from '@pd/api-core';
import { todayIn, toLocalDate } from '@pd/contracts';
import { eq, sql } from 'drizzle-orm';
import { RepoIssue, RepoSnapshot, RepoSource } from './repo-source';
import { fetchNpmPackageRepo, fetchNpmWeeklyDownloads } from './npm.client';
import { repoDailyStats, TrackedRepoRow, trackedRepos } from './open-source.schema';
import { crossedStarMilestone } from './star-stats';

/** How long an answer of the npm registry about a package's repository is trusted. */
const OWNERSHIP_TTL_MS = 24 * 60 * 60 * 1000;

/** What happened to the repository since the last sync — for notifications. */
export interface RepoSyncEvents {
  fullName: string;
  newIssues: RepoIssue[];
  newPulls: RepoIssue[];
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
  /** `repository|package` → whether npm says the package is published from that repository. */
  private readonly ownership = new Map<string, { owned: boolean; expiresAt: number }>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  async apply(
    repo: TrackedRepoRow,
    snapshot: RepoSnapshot,
    source: RepoSource,
  ): Promise<RepoSyncEvents | null> {
    // A package set by hand wins over the detected one (`null` — "it has none").
    const npmPackage = repo.npmPackageManual
      ? repo.npmPackage
      : await this.detectedPackage(repo, snapshot);
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
    const created = await source.listCreatedSince(snapshot.fullName, repo.lastSyncedAt);
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

  /**
   * The package of package.json — only if npm confirms it is published from this repository.
   * A name alone proves nothing: a fork carries the name of the original, and an app called
   * `docs` or `website` shares its name with somebody else's package.
   * (Only GitHub repositories carry a package name here; elsewhere it is set by hand.)
   */
  private async detectedPackage(
    repo: TrackedRepoRow,
    snapshot: RepoSnapshot,
  ): Promise<string | null> {
    const candidate = snapshot.packageName;
    if (!candidate) {
      return null;
    }
    const fullName = snapshot.fullName.toLowerCase();
    const key = `${fullName}|${candidate}`;
    const known = this.ownership.get(key);
    if (known && known.expiresAt > Date.now()) {
      return known.owned ? candidate : null;
    }
    try {
      const owned = (await fetchNpmPackageRepo(candidate)) === fullName;
      this.ownership.set(key, { owned, expiresAt: Date.now() + OWNERSHIP_TTL_MS });
      return owned ? candidate : null;
    } catch (error) {
      // npm being down changes nothing: what was accepted before stays.
      this.logger.warn(`npm registry check of ${candidate} failed: ${error}`);
      return repo.npmPackage === candidate ? candidate : null;
    }
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
