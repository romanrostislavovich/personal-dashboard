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
import { addDays, DateParts, todayIn, toLocalDate, TrackedRepo } from '@pd/contracts';
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { GithubNotFoundError } from './clients/github.client';
import { GithubTokenService } from './github-token.service';
import {
  repoDailyStats,
  RepoDailyStatsRow,
  TrackedRepoRow,
  trackedRepos,
} from './github-oss.schema';
import { starsDelta } from './stats/star-stats';
import { RepoSyncEvents, RepoSyncService } from './sync/repo-sync.service';

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

  /** Репозитории пользователя (по звёздам) с историей за 30 дней. */
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

  /** Добавляет репозиторий и сразу синхронизирует его, чтобы показать данные. */
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

  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .delete(trackedRepos)
      .where(and(eq(trackedRepos.id, id), eq(trackedRepos.userId, userId)));
  }

  /** Синхронизирует все репозитории пользователя; ошибки одного не мешают остальным. */
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
