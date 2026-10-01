import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database, isUniqueViolation } from '@pd/api-core';
import { addDays, DateParts, todayIn, toLocalDate, TrackedRepo } from '@pd/contracts';
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { GithubNotFoundError } from '../github/github.client';
import { GithubTokenService } from '../github/github-token.service';
import {
  repoDailyStats,
  RepoDailyStatsRow,
  TrackedRepoRow,
  trackedRepos,
} from './open-source.schema';
import { starsDelta } from './star-stats';
import { RepoSyncEvents, RepoSyncService } from './repo-sync.service';

const HISTORY_DAYS = 30;

@Injectable()
export class ReposService {
  private readonly logger = new Logger(ReposService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly tokens: GithubTokenService,
    private readonly repoSync: RepoSyncService,
  ) {}

  /** The user's repositories (by stars) with 30-day history. */
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

    return repos.map((repo) =>
      toTrackedRepo(
        repo,
        history.filter((point) => point.repoId === repo.id),
        today,
      ),
    );
  }

  /** Adds a repository and syncs it right away to show data. */
  async add(userId: string, fullName: string, npmPackage: string | null): Promise<void> {
    const github = await this.tokens.clientFor(userId);
    let canonical: { fullName: string; htmlUrl: string };
    try {
      canonical = await github.getRepo(fullName);
    } catch (error) {
      if (error instanceof GithubNotFoundError) {
        throw new BadRequestException('Repository not found on GitHub');
      }
      throw error;
    }

    const [row] = await this.db
      .insert(trackedRepos)
      .values({ userId, fullName: canonical.fullName, htmlUrl: canonical.htmlUrl, npmPackage })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      throw new ConflictException('Repository is already tracked');
    }
    await this.syncRepo(row, userId);
  }

  /**
   * Changes the repository or its npm package and syncs it. Another repository starts its
   * history from scratch: the saved star history belonged to the old one.
   */
  async update(
    userId: string,
    id: string,
    fullName: string,
    npmPackage: string | null,
  ): Promise<void> {
    const [current] = await this.db
      .select()
      .from(trackedRepos)
      .where(and(eq(trackedRepos.id, id), eq(trackedRepos.userId, userId)));
    if (!current) {
      throw new NotFoundException('Repository not found');
    }
    let canonical = { fullName: current.fullName, htmlUrl: current.htmlUrl };
    if (fullName.toLowerCase() !== current.fullName.toLowerCase()) {
      try {
        canonical = await (await this.tokens.clientFor(userId)).getRepo(fullName);
      } catch (error) {
        if (error instanceof GithubNotFoundError) {
          throw new BadRequestException('Repository not found on GitHub');
        }
        throw error;
      }
    }
    const repoChanged = canonical.fullName !== current.fullName;
    const [row] = await this.db
      .transaction(async (tx) => {
        if (repoChanged) {
          await tx.delete(repoDailyStats).where(eq(repoDailyStats.repoId, id));
        }
        return tx
          .update(trackedRepos)
          .set({ ...canonical, npmPackage })
          .where(eq(trackedRepos.id, id))
          .returning();
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictException('Repository is already tracked');
        }
        throw error;
      });
    await this.syncRepo(row, userId);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .delete(trackedRepos)
      .where(and(eq(trackedRepos.id, id), eq(trackedRepos.userId, userId)));
  }

  /** Syncs all of the user's repositories; an error in one does not affect the others. */
  async syncAll(userId: string): Promise<RepoSyncEvents[]> {
    const repos = await this.db.select().from(trackedRepos).where(eq(trackedRepos.userId, userId));
    const events: RepoSyncEvents[] = [];
    for (const repo of repos) {
      const result = await this.syncRepo(repo, userId);
      if (result) {
        events.push(result);
      }
    }
    return events;
  }

  async syncOne(userId: string, id: string): Promise<void> {
    const [repo] = await this.db
      .select()
      .from(trackedRepos)
      .where(and(eq(trackedRepos.id, id), eq(trackedRepos.userId, userId)));
    if (!repo) {
      throw new NotFoundException();
    }
    await this.syncRepo(repo, userId);
  }

  private async syncRepo(repo: TrackedRepoRow, userId: string): Promise<RepoSyncEvents | null> {
    try {
      return await this.repoSync.sync(repo, await this.tokens.clientFor(userId));
    } catch (error) {
      this.logger.warn(`Sync of ${repo.fullName} failed: ${error}`);
      await this.repoSync.markFailed(repo, error);
      return null;
    }
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
    fullName: repo.fullName,
    htmlUrl: repo.htmlUrl,
    description: repo.description,
    npmPackage: repo.npmPackage,
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
