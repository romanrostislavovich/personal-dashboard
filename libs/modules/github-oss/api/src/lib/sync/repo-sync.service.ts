import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database } from '@pd/api-core';
import { todayIn, toLocalDate } from '@pd/contracts';
import { eq } from 'drizzle-orm';
import { GithubClient, GithubIssue, GithubRelease } from '../clients/github.client';
import { fetchNpmWeeklyDownloads } from '../clients/npm.client';
import { repoDailyStats, TrackedRepoRow, trackedRepos } from '../github-oss.schema';
import { crossedStarMilestone } from '../stats/star-stats';

/** Что нового произошло с репозиторием с прошлой синхронизации — для уведомлений. */
export interface RepoSyncEvents {
  fullName: string;
  newIssues: GithubIssue[];
  newPulls: GithubIssue[];
  newRelease: GithubRelease | null;
  starMilestone: number | null;
}

/**
 * Синхронизация одного репозитория: тянет свежие данные из GitHub и npm,
 * обновляет текущие показатели и дневную историю, возвращает события.
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
    // При первой синхронизации не засыпаем уведомлениями про старые issues.
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
