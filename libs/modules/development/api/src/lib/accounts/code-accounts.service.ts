import { BadRequestException, HttpException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database } from '@pd/api-core';
import {
  CodeAccount,
  DateParts,
  GithubContributionDay,
  GithubYearTotals,
  LocalDate,
  todayIn,
  toLocalDate,
  TokenProvider,
} from '@pd/contracts';
import { and, asc, between, desc, eq, gte, notInArray, sql } from 'drizzle-orm';
import { contributionStats } from '../github-profile/contribution-stats';
import { FetchedAccount } from './account-source';
import { AccountTokensService } from './account-tokens.service';
import { codeAccountDays, codeAccounts } from './accounts.schema';
import { ActivityDay, activityDays } from './activity-days';

const TOP_REPOS = 10;
const TOP_LANGUAGES = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * How far back an hourly sync re-reads the activity: late pushes of commits made earlier and
 * the hours the service was not reachable land in days that are already over.
 */
const REFRESH_DAYS = 4;
/** Rows per INSERT: eight values each, far below PostgreSQL's limit of 65,535 parameters. */
const INSERT_CHUNK = 1000;

/** The GitLab and Bitbucket accounts: the saved copy and its sync with the service. */
@Injectable()
export class CodeAccountsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly tokens: AccountTokensService,
  ) {}

  /** `null` until the first sync (no token yet). */
  async account(userId: string, provider: TokenProvider): Promise<CodeAccount | null> {
    const [row] = await this.db.select().from(codeAccounts).where(this.owned(userId, provider));
    if (!row) {
      return null;
    }
    const years = await this.years(userId, provider);
    return {
      provider,
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
      ...contributionStats(await this.allDays(userId, provider), this.today()),
      years,
      languages: row.languages,
      topRepos: row.topRepos,
      // Followers are not tracked day by day for these services.
      followersHistory: [],
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      syncError: row.syncError,
    };
  }

  /** The calendar of a period: only the days with something done. */
  contributions(
    userId: string,
    provider: TokenProvider,
    from: LocalDate,
    to: LocalDate,
  ): Promise<GithubContributionDay[]> {
    const d = codeAccountDays;
    return this.db
      .select({ day: d.day, count: d.count })
      .from(d)
      .where(and(eq(d.userId, userId), eq(d.provider, provider), between(d.day, from, to)))
      .orderBy(asc(d.day));
  }

  /** Every saved day, oldest first — for streaks and records. */
  allDays(userId: string, provider: TokenProvider): Promise<GithubContributionDay[]> {
    return this.contributions(userId, provider, '0001-01-01', '9999-12-31');
  }

  /** What every year was made of, newest first. */
  async years(userId: string, provider: TokenProvider): Promise<GithubYearTotals[]> {
    const d = codeAccountDays;
    const year = sql<number>`extract(year from ${d.day})::int`;
    const rows = await this.db
      .select({
        year,
        contributions: sql<number>`sum(${d.count})::int`,
        commits: sql<number>`sum(${d.commits})::int`,
        pullRequests: sql<number>`sum(${d.pullRequests})::int`,
        reviews: sql<number>`sum(${d.reviews})::int`,
        issues: sql<number>`sum(${d.issues})::int`,
      })
      .from(d)
      .where(and(eq(d.userId, userId), eq(d.provider, provider)))
      .groupBy(year)
      .orderBy(desc(year));
    return rows.map((row) => ({ ...row, restricted: 0 }));
  }

  /**
   * Fetches the account and its activity. The first sync brings everything the service has;
   * the later ones re-read the last few days.
   */
  async sync(userId: string, provider: TokenProvider): Promise<void> {
    const sources = await this.tokens.sources(userId, provider);
    if (!sources) {
      throw new BadRequestException(`The ${provider} token is not set`);
    }
    try {
      const [saved] = await this.db
        .select({ lastSyncedAt: codeAccounts.lastSyncedAt })
        .from(codeAccounts)
        .where(this.owned(userId, provider));
      const since = saved?.lastSyncedAt ? refreshFrom(saved.lastSyncedAt) : null;
      const account = await sources.account.getAccount();
      const timeZone = this.config.get('APP_TIMEZONE', { infer: true });
      const days = activityDays(await sources.account.getActivity(since), timeZone);
      // The day `since` falls into is read only in part: it keeps what is saved.
      const from = since
        ? toLocalDate(todayIn(timeZone, new Date(since.getTime() + DAY_MS)))
        : null;
      await this.save(
        userId,
        provider,
        account,
        days.filter((day) => !from || day.day >= from),
        from,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.db
        .update(codeAccounts)
        .set({ syncError: message })
        .where(this.owned(userId, provider));
      // The page shows the service's own explanation (an invalid token, a missing scope).
      throw error instanceof HttpException ? error : new BadRequestException(message);
    }
  }

  /** Forgets the account when its token is removed. */
  async remove(userId: string, provider: TokenProvider): Promise<void> {
    const d = codeAccountDays;
    await this.db.transaction(async (tx) => {
      await tx.delete(d).where(and(eq(d.userId, userId), eq(d.provider, provider)));
      await tx.delete(codeAccounts).where(this.owned(userId, provider));
    });
  }

  today(): DateParts {
    return todayIn(this.config.get('APP_TIMEZONE', { infer: true }));
  }

  /** `from` — the days from it on are replaced by `days`; `null` — all of them. */
  private async save(
    userId: string,
    provider: TokenProvider,
    account: FetchedAccount,
    days: ActivityDay[],
    from: LocalDate | null,
  ): Promise<void> {
    const profile = {
      ...account,
      joinedAt: new Date(account.joinedAt),
      languages: account.languages.slice(0, TOP_LANGUAGES),
      topRepos: account.topRepos.slice(0, TOP_REPOS),
      lastSyncedAt: new Date(),
      syncError: null,
    };
    const d = codeAccountDays;
    await this.db.transaction(async (tx) => {
      await tx
        .insert(codeAccounts)
        .values({ userId, provider, ...profile })
        .onConflictDoUpdate({ target: [codeAccounts.userId, codeAccounts.provider], set: profile });

      // A day whose activity is gone (a deleted repository) goes too.
      const kept = days.map((day) => day.day);
      await tx
        .delete(d)
        .where(
          and(
            eq(d.userId, userId),
            eq(d.provider, provider),
            from ? gte(d.day, from) : undefined,
            kept.length > 0 ? notInArray(d.day, kept) : undefined,
          ),
        );
      for (let i = 0; i < days.length; i += INSERT_CHUNK) {
        await tx
          .insert(d)
          .values(days.slice(i, i + INSERT_CHUNK).map((day) => ({ userId, provider, ...day })))
          .onConflictDoUpdate({
            target: [d.userId, d.provider, d.day],
            set: {
              count: sql`excluded.count`,
              commits: sql`excluded.commits`,
              pullRequests: sql`excluded.pull_requests`,
              reviews: sql`excluded.reviews`,
              issues: sql`excluded.issues`,
            },
            // The last days are re-read every hour: rows that did not change stay untouched,
            // otherwise each of them would be sent again by the sync between instances.
            setWhere: sql`(${d.count}, ${d.commits}, ${d.pullRequests}, ${d.reviews}, ${d.issues})
              IS DISTINCT FROM (excluded.count, excluded.commits, excluded.pull_requests, excluded.reviews, excluded.issues)`,
          });
      }
    });
  }

  private owned(userId: string, provider: TokenProvider) {
    return and(eq(codeAccounts.userId, userId), eq(codeAccounts.provider, provider));
  }
}

/** The moment an hourly sync reads the activity from: a few whole days back. */
export function refreshFrom(lastSyncedAt: Date): Date {
  const start = new Date(lastSyncedAt.getTime() - REFRESH_DAYS * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}
