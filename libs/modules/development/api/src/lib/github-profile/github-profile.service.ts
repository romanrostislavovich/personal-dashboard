import { BadRequestException, HttpException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database } from '@pd/api-core';
import {
  addDays,
  DateParts,
  GithubContributionDay,
  GithubProfile,
  LocalDate,
  todayIn,
  toLocalDate,
} from '@pd/contracts';
import { and, asc, between, desc, eq, gte, sql } from 'drizzle-orm';
import { GithubTokenService } from '../github/github-token.service';
import { contributionStats, yearsToSync } from './contribution-stats';
import {
  GithubGraphqlClient,
  GithubViewer,
  GithubYearContributions,
} from './github-graphql.client';
import {
  githubContributionDays,
  githubContributionYears,
  githubProfileDailyStats,
  githubProfiles,
} from './github-profile.schema';

const FOLLOWERS_HISTORY_DAYS = 90;
const TOP_REPOS = 10;
const TOP_LANGUAGES = 10;
/** Rows per INSERT: three values each, far below PostgreSQL's limit of 65,535 parameters. */
const INSERT_CHUNK = 1000;

interface FetchedYear extends GithubYearContributions {
  year: number;
}

/** The GitHub account of the token's owner: the saved copy and its sync with GitHub. */
@Injectable()
export class GithubProfileService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly tokens: GithubTokenService,
  ) {}

  /** `null` until the first sync (no token yet). */
  async profile(userId: string): Promise<GithubProfile | null> {
    const [row] = await this.db
      .select()
      .from(githubProfiles)
      .where(eq(githubProfiles.userId, userId));
    if (!row) {
      return null;
    }
    const today = this.today();
    const years = await this.db
      .select()
      .from(githubContributionYears)
      .where(eq(githubContributionYears.userId, userId))
      .orderBy(desc(githubContributionYears.year));
    const followersHistory = await this.db
      .select({ day: githubProfileDailyStats.day, followers: githubProfileDailyStats.followers })
      .from(githubProfileDailyStats)
      .where(
        and(
          eq(githubProfileDailyStats.userId, userId),
          gte(githubProfileDailyStats.day, toLocalDate(addDays(today, -FOLLOWERS_HISTORY_DAYS))),
        ),
      )
      .orderBy(asc(githubProfileDailyStats.day));

    return {
      login: row.login,
      name: row.name,
      avatarUrl: row.avatarUrl,
      htmlUrl: row.htmlUrl,
      joinedAt: row.joinedAt.toISOString(),
      followers: row.followers,
      following: row.following,
      repos: row.repos,
      totalStars: row.totalStars,
      totalContributions: years.reduce((sum, year) => sum + year.contributions, 0),
      ...contributionStats(await this.allDays(userId), today),
      years: years.map(({ userId: _userId, ...year }) => year),
      languages: row.languages,
      topRepos: row.topRepos,
      followersHistory,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      syncError: row.syncError,
    };
  }

  /** The calendar of a period, zero days included. */
  contributions(userId: string, from: LocalDate, to: LocalDate): Promise<GithubContributionDay[]> {
    return this.db
      .select({ day: githubContributionDays.day, count: githubContributionDays.count })
      .from(githubContributionDays)
      .where(
        and(
          eq(githubContributionDays.userId, userId),
          between(githubContributionDays.day, from, to),
        ),
      )
      .orderBy(asc(githubContributionDays.day));
  }

  /** Every saved day, oldest first — for streaks and records. */
  allDays(userId: string): Promise<GithubContributionDay[]> {
    return this.contributions(userId, '0001-01-01', '9999-12-31');
  }

  /** Sums over all years: the metrics of the achievements. */
  async totals(userId: string) {
    const [row] = await this.db
      .select({
        contributions: sql<number>`coalesce(sum(${githubContributionYears.contributions}), 0)`,
        commits: sql<number>`coalesce(sum(${githubContributionYears.commits}), 0)`,
        pullRequests: sql<number>`coalesce(sum(${githubContributionYears.pullRequests}), 0)`,
        reviews: sql<number>`coalesce(sum(${githubContributionYears.reviews}), 0)`,
        issues: sql<number>`coalesce(sum(${githubContributionYears.issues}), 0)`,
      })
      .from(githubContributionYears)
      .where(eq(githubContributionYears.userId, userId));
    return {
      contributions: Number(row.contributions),
      commits: Number(row.commits),
      pullRequests: Number(row.pullRequests),
      reviews: Number(row.reviews),
      issues: Number(row.issues),
    };
  }

  async followers(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ followers: githubProfiles.followers })
      .from(githubProfiles)
      .where(eq(githubProfiles.userId, userId));
    return row?.followers ?? 0;
  }

  /**
   * Fetches the account from GitHub: the profile, and the calendar of the years not saved yet
   * plus the two latest ones. The first sync brings the whole history, a request per year.
   */
  async sync(userId: string): Promise<void> {
    const token = await this.tokens.token(userId);
    if (!token) {
      throw new BadRequestException('GitHub token is not set');
    }
    const github = new GithubGraphqlClient(token);
    try {
      const viewer = await github.getViewer();
      const today = this.today();
      const years: FetchedYear[] = [];
      const joinedYear = new Date(viewer.joinedAt).getUTCFullYear();
      for (const year of yearsToSync(joinedYear, today.year, await this.savedYears(userId))) {
        years.push({ year, ...(await github.getYear(year)) });
      }
      await this.save(userId, viewer, years, today);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.db
        .update(githubProfiles)
        .set({ syncError: message })
        .where(eq(githubProfiles.userId, userId));
      // The page shows GitHub's own explanation (an invalid token, a missing permission).
      throw error instanceof HttpException ? error : new BadRequestException(message);
    }
  }

  private async save(
    userId: string,
    viewer: GithubViewer,
    years: FetchedYear[],
    today: DateParts,
  ): Promise<void> {
    const todayDate = toLocalDate(today);
    const profile = {
      login: viewer.login,
      name: viewer.name,
      avatarUrl: viewer.avatarUrl,
      htmlUrl: viewer.htmlUrl,
      joinedAt: new Date(viewer.joinedAt),
      followers: viewer.followers,
      following: viewer.following,
      repos: viewer.repos,
      totalStars: viewer.totalStars,
      languages: viewer.languages.slice(0, TOP_LANGUAGES),
      topRepos: viewer.topRepos.slice(0, TOP_REPOS),
      lastSyncedAt: new Date(),
      syncError: null,
    };
    const daily = {
      followers: viewer.followers,
      repos: viewer.repos,
      totalStars: viewer.totalStars,
    };
    // The rest of the current year has not happened yet.
    const days = years
      .flatMap((year) => year.days)
      .filter((day) => day.day <= todayDate || day.count > 0);

    await this.db.transaction(async (tx) => {
      await tx
        .insert(githubProfiles)
        .values({ userId, ...profile })
        .onConflictDoUpdate({ target: githubProfiles.userId, set: profile });
      await tx
        .insert(githubProfileDailyStats)
        .values({ userId, day: todayDate, ...daily })
        .onConflictDoUpdate({
          target: [githubProfileDailyStats.userId, githubProfileDailyStats.day],
          set: daily,
        });
      for (const { year, days: _days, ...totals } of years) {
        await tx
          .insert(githubContributionYears)
          .values({ userId, year, ...totals })
          .onConflictDoUpdate({
            target: [githubContributionYears.userId, githubContributionYears.year],
            set: totals,
          });
      }
      for (let i = 0; i < days.length; i += INSERT_CHUNK) {
        await tx
          .insert(githubContributionDays)
          .values(days.slice(i, i + INSERT_CHUNK).map((day) => ({ userId, ...day })))
          .onConflictDoUpdate({
            target: [githubContributionDays.userId, githubContributionDays.day],
            set: { count: sql`excluded.count` },
            // Two years are re-read every hour: rows that did not change stay untouched,
            // otherwise each of them would be sent again by the sync between instances.
            setWhere: sql`${githubContributionDays.count} <> excluded.count`,
          });
      }
    });
  }

  private async savedYears(userId: string): Promise<number[]> {
    const rows = await this.db
      .select({ year: githubContributionYears.year })
      .from(githubContributionYears)
      .where(eq(githubContributionYears.userId, userId));
    return rows.map((row) => row.year);
  }

  today(): DateParts {
    return todayIn(this.config.get('APP_TIMEZONE', { infer: true }));
  }
}
