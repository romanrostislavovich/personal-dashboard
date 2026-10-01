import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database } from '@pd/api-core';
import {
  addDays,
  DateParts,
  todayIn,
  toLocalDate,
  TrackedRepo,
  trackedRepoUpdateSchema,
} from '@pd/contracts';
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { GithubClient } from '../github/github.client';
import { GithubTokenService } from '../github/github-token.service';
import { GithubReposClient, RepoSnapshot } from './github-repos.client';
import {
  repoDailyStats,
  RepoDailyStatsRow,
  TrackedRepoRow,
  trackedRepos,
} from './open-source.schema';
import { planRepoList } from './repo-list-plan';
import { RepoSyncEvents, RepoSyncService } from './repo-sync.service';
import { starsDelta } from './star-stats';

const HISTORY_DAYS = 30;

type RepoUpdate = z.output<typeof trackedRepoUpdateSchema>;

/**
 * Repositories of the Open Source section. The list builds itself: every sync brings the public
 * repositories of the GitHub account and of its organizations; any other can be added by hand.
 */
@Injectable()
export class ReposService {
  private readonly logger = new Logger(ReposService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly tokens: GithubTokenService,
    private readonly repoSync: RepoSyncService,
  ) {}

  /** The user's repositories (by stars, hidden ones included) with 30-day history. */
  async list(userId: string): Promise<TrackedRepo[]> {
    const repos = await this.db
      .select()
      .from(trackedRepos)
      .where(eq(trackedRepos.userId, userId))
      .orderBy(desc(trackedRepos.stars), asc(trackedRepos.fullName));
    if (repos.length === 0) {
      return [];
    }

    const today = this.today();
    const historyFrom = toLocalDate(addDays(today, -HISTORY_DAYS));
    const history = await this.db
      .select()
      .from(repoDailyStats)
      .where(
        and(
          inArray(
            repoDailyStats.repoId,
            repos.map((repo) => repo.id),
          ),
          gte(repoDailyStats.day, historyFrom),
        ),
      )
      .orderBy(asc(repoDailyStats.day));
    const byRepo = new Map<string, RepoDailyStatsRow[]>();
    for (const point of history) {
      byRepo.set(point.repoId, [...(byRepo.get(point.repoId) ?? []), point]);
    }

    return repos.map((repo) => toTrackedRepo(repo, byRepo.get(repo.id) ?? [], today));
  }

  /** The repositories shown by default: without the hidden ones. */
  async visible(userId: string): Promise<TrackedRepo[]> {
    return (await this.list(userId)).filter((repo) => !repo.hidden);
  }

  /** Adds a repository by hand — one the account does not bring — and loads it right away. */
  async add(userId: string, fullName: string, npmPackage: string | null): Promise<void> {
    const token = await this.requireToken(userId);
    const [snapshot] = await new GithubReposClient(token).getMany([fullName]);
    if (!snapshot) {
      throw new BadRequestException('Repository not found on GitHub');
    }
    const [row] = await this.db
      .insert(trackedRepos)
      .values({
        userId,
        relation: 'manual',
        externalId: snapshot.externalId,
        fullName: snapshot.fullName,
        htmlUrl: snapshot.htmlUrl,
        npmPackage,
        npmPackageManual: npmPackage !== null,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      throw new ConflictException('Repository is already tracked');
    }
    await this.repoSync.apply(row, snapshot, new GithubClient(token));
  }

  /** Hides or shows a repository, switches its notifications, sets its npm package. */
  async update(userId: string, id: string, update: RepoUpdate): Promise<void> {
    const { npmPackage, ...flags } = update;
    const [row] = await this.db
      .update(trackedRepos)
      .set({
        ...flags,
        // The downloads of another package are not this one's: they come with the next sync.
        ...(npmPackage === undefined
          ? {}
          : { npmPackage, npmPackageManual: true, npmWeeklyDownloads: null }),
      })
      .where(and(eq(trackedRepos.id, id), eq(trackedRepos.userId, userId)))
      .returning();
    if (!row) {
      throw new NotFoundException('Repository not found');
    }
  }

  /** Stops tracking a repository added by hand. One of the account comes back by itself — hide it. */
  async remove(userId: string, id: string): Promise<void> {
    const [repo] = await this.db
      .select()
      .from(trackedRepos)
      .where(and(eq(trackedRepos.id, id), eq(trackedRepos.userId, userId)));
    if (!repo) {
      return;
    }
    if (repo.relation !== 'manual') {
      throw new BadRequestException('A repository of the account cannot be removed: hide it');
    }
    await this.db.delete(trackedRepos).where(eq(trackedRepos.id, id));
  }

  /**
   * Brings the list in line with the account and refreshes every repository: two or three
   * GitHub requests for all of them. Returns the news of the repositories with notifications on.
   * Without a token there is nothing to read with — the list stays as it is.
   */
  async syncAll(userId: string): Promise<RepoSyncEvents[]> {
    const token = await this.tokens.token(userId);
    if (!token) {
      return [];
    }
    const client = new GithubReposClient(token);
    const rest = new GithubClient(token);
    const rows = await this.db.select().from(trackedRepos).where(eq(trackedRepos.userId, userId));
    const plan = planRepoList(rows, await client.listAccount());

    if (plan.removed.length > 0) {
      await this.db.delete(trackedRepos).where(
        inArray(
          trackedRepos.id,
          plan.removed.map((row) => row.id),
        ),
      );
    }
    const fresh: { row: TrackedRepoRow; snapshot: RepoSnapshot }[] = [];
    for (const { row, repo } of plan.matched) {
      // One added by hand earlier turned out to be the account's own.
      if (row.relation !== repo.relation) {
        await this.db
          .update(trackedRepos)
          .set({ relation: repo.relation })
          .where(eq(trackedRepos.id, row.id));
      }
      fresh.push({ row, snapshot: repo });
    }
    for (const repo of plan.added) {
      const [row] = await this.db
        .insert(trackedRepos)
        .values({
          userId,
          relation: repo.relation,
          externalId: repo.externalId,
          fullName: repo.fullName,
          htmlUrl: repo.htmlUrl,
        })
        .onConflictDoNothing()
        .returning();
      if (row) {
        fresh.push({ row, snapshot: repo });
      }
    }
    const manual = await client.getMany(plan.manual.map((row) => row.fullName));
    for (const [index, row] of plan.manual.entries()) {
      const snapshot = manual[index];
      if (snapshot) {
        fresh.push({ row, snapshot });
      } else {
        await this.repoSync.markFailed(row, new Error('Repository not found on GitHub'));
      }
    }

    const events: RepoSyncEvents[] = [];
    for (const { row, snapshot } of fresh) {
      try {
        const result = await this.repoSync.apply(row, snapshot, rest);
        if (result) {
          events.push(result);
        }
      } catch (error) {
        // An error in one repository does not affect the others.
        this.logger.warn(`Sync of ${row.fullName} failed: ${error}`);
        await this.repoSync.markFailed(row, error);
      }
    }
    return events;
  }

  private async requireToken(userId: string): Promise<string> {
    const token = await this.tokens.token(userId);
    if (!token) {
      throw new BadRequestException('GitHub token is not set');
    }
    return token;
  }

  private today(): DateParts {
    return todayIn(this.config.get('APP_TIMEZONE', { infer: true }));
  }
}

function toTrackedRepo(
  repo: TrackedRepoRow,
  history: RepoDailyStatsRow[],
  today: DateParts,
): TrackedRepo {
  return {
    id: repo.id,
    provider: repo.provider,
    relation: repo.relation,
    fullName: repo.fullName,
    htmlUrl: repo.htmlUrl,
    description: repo.description,
    language: repo.language,
    isFork: repo.isFork,
    isArchived: repo.isArchived,
    hidden: repo.hidden,
    notify: repo.notify,
    npmPackage: repo.npmPackage,
    npmPackageManual: repo.npmPackageManual,
    stars: repo.stars,
    forks: repo.forks,
    openIssues: repo.openIssues,
    openPulls: repo.openPulls,
    npmWeeklyDownloads: repo.npmWeeklyDownloads,
    latestRelease:
      repo.latestReleaseTag && repo.latestReleaseAt
        ? { tag: repo.latestReleaseTag, publishedAt: repo.latestReleaseAt.toISOString() }
        : null,
    pushedAt: repo.pushedAt?.toISOString() ?? null,
    lastSyncedAt: repo.lastSyncedAt?.toISOString() ?? null,
    syncError: repo.syncError,
    starsDelta: {
      week: starsDelta(history, repo.stars, today, 7),
      month: starsDelta(history, repo.stars, today, 30),
    },
    history: history.map((point) => ({
      day: point.day,
      stars: point.stars,
      npmWeeklyDownloads: point.npmWeeklyDownloads,
    })),
  };
}
