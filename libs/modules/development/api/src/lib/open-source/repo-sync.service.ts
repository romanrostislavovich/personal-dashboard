import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database } from '@pd/api-core';
import { todayIn, toLocalDate } from '@pd/contracts';
import { eq } from 'drizzle-orm';
import { GithubClient, GithubIssue, GithubRelease } from '../github/github.client';
import { fetchNpmWeeklyDownloads } from './npm.client';
import { repoDailyStats, TrackedRepoRow, trackedRepos } from './open-source.schema';
import { crossedStarMilestone } from './star-stats';

/** What happened to the repository since the last sync — for notifications. */
export interface RepoSyncEvents {
  fullName: string;
  newIssues: GithubIssue[];
  newPulls: GithubIssue[];
  newRelease: GithubRelease | null;
  starMilestone: number | null;
}

/**
 * Syncs one repository: fetches fresh data from GitHub and npm,
 * updates the current figures and daily history, returns events.
 */
@Injectable()
export class RepoSyncService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  async sync(repo: TrackedRepoRow, github: GithubClient): Promise<RepoSyncEvents> {
    const [info, openPulls, release, npmWeeklyDownloads] = await Promise.all([
      github.getRepo(repo.fullName),
      github.countOpenPulls(repo.fullName),
      github.getLatestRelease(repo.fullName),
      repo.npmPackage ? fetchNpmWeeklyDownloads(repo.npmPackage) : Promise.resolve(null),
    ]);
    // On the first sync, do not flood notifications about old issues.
    const created = repo.lastSyncedAt
      ? await github.listCreatedSince(repo.fullName, repo.lastSyncedAt)
      : [];

    const stats = {
      stars: info.stars,
      forks: info.forks,
      openIssues: Math.max(info.openIssuesAndPulls - openPulls, 0),
      openPulls,
      npmWeeklyDownloads,
    };

    await this.db
      .update(trackedRepos)
      .set({
        ...stats,
        fullName: info.fullName,
        htmlUrl: info.htmlUrl,
        description: info.description,
        pushedAt: info.pushedAt ? new Date(info.pushedAt) : null,
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
      .onConflictDoUpdate({ target: [repoDailyStats.repoId, repoDailyStats.day], set: stats });

    const isFirstSync = !repo.lastSyncedAt;
    return {
      fullName: info.fullName,
      newIssues: created.filter((item) => !item.isPullRequest),
      newPulls: created.filter((item) => item.isPullRequest),
      newRelease: !isFirstSync && release && release.tag !== repo.latestReleaseTag ? release : null,
      starMilestone: isFirstSync ? null : crossedStarMilestone(repo.stars, info.stars),
    };
  }

  async markFailed(repo: TrackedRepoRow, error: unknown): Promise<void> {
    await this.db
      .update(trackedRepos)
      .set({ syncError: error instanceof Error ? error.message : String(error) })
      .where(eq(trackedRepos.id, repo.id));
  }
}
