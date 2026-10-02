import {
  CodeAccount,
  CodeAccountsSummary,
  CodeSummaryYear,
  DateParts,
  GithubContributionDay,
} from '@pd/contracts';
import { contributionStats } from '../github-profile/contribution-stats';

/** An account with its whole calendar. */
export interface AccountWithDays {
  account: CodeAccount;
  days: GithubContributionDay[];
}

/** The calendars of several services as one: a day counts what was done on all of them. */
export function mergeDays(calendars: GithubContributionDay[][]): GithubContributionDay[] {
  const counts = new Map<string, number>();
  for (const { day, count } of calendars.flat()) {
    counts.set(day, (counts.get(day) ?? 0) + count);
  }
  return [...counts.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** All connected accounts as one: the common calendar, its streak and the years. */
export function summarize(accounts: AccountWithDays[], today: DateParts): CodeAccountsSummary {
  const years = new Map<number, CodeSummaryYear>();
  for (const { account } of accounts) {
    for (const { restricted: _restricted, year, ...totals } of account.years) {
      const sum = years.get(year) ?? {
        year,
        contributions: 0,
        commits: 0,
        pullRequests: 0,
        reviews: 0,
        issues: 0,
        byProvider: {},
      };
      sum.contributions += totals.contributions;
      sum.commits += totals.commits;
      sum.pullRequests += totals.pullRequests;
      sum.reviews += totals.reviews;
      sum.issues += totals.issues;
      sum.byProvider[account.provider] = totals.contributions;
      years.set(year, sum);
    }
  }
  return {
    accounts: accounts.map(({ account }) => ({
      provider: account.provider,
      login: account.login,
      htmlUrl: account.htmlUrl,
      totalContributions: account.totalContributions,
      today: account.today,
      week: account.week,
      streak: account.streak,
      lastSyncedAt: account.lastSyncedAt,
      syncError: account.syncError,
    })),
    totalContributions: accounts.reduce((sum, { account }) => sum + account.totalContributions, 0),
    ...contributionStats(mergeDays(accounts.map(({ days }) => days)), today),
    years: [...years.values()].sort((a, b) => b.year - a.year),
  };
}
