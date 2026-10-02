import { Injectable } from '@nestjs/common';
import {
  CODE_PROVIDERS,
  CodeAccount,
  CodeAccountsSummary,
  CodeProvider,
  GithubContributionDay,
  LocalDate,
} from '@pd/contracts';
import { GithubProfileService } from '../github-profile/github-profile.service';
import { CodeAccountsService } from './code-accounts.service';
import { AccountWithDays, mergeDays, summarize } from './summary';

/**
 * The accounts of all code hosting services behind one interface: GitHub is kept by its own
 * service, GitLab and Bitbucket by `CodeAccountsService`. The summary puts them together.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly github: GithubProfileService,
    private readonly others: CodeAccountsService,
  ) {}

  /** `null` until the first sync (no token yet). */
  async account(userId: string, provider: CodeProvider): Promise<CodeAccount | null> {
    if (provider !== 'github') {
      return this.others.account(userId, provider);
    }
    const profile = await this.github.profile(userId);
    return profile && { provider, ...profile };
  }

  /** The calendar of a period. */
  contributions(
    userId: string,
    provider: CodeProvider,
    from: LocalDate,
    to: LocalDate,
  ): Promise<GithubContributionDay[]> {
    return provider === 'github'
      ? this.github.contributions(userId, from, to)
      : this.others.contributions(userId, provider, from, to);
  }

  sync(userId: string, provider: CodeProvider): Promise<void> {
    return provider === 'github' ? this.github.sync(userId) : this.others.sync(userId, provider);
  }

  /** Every connected account as one; `null` — none is connected yet. */
  async summary(userId: string): Promise<CodeAccountsSummary | null> {
    const accounts = await this.withDays(userId);
    return accounts.length > 0 ? summarize(accounts, this.github.today()) : null;
  }

  /** The common calendar of a period: the days of all services added up. */
  async summaryContributions(
    userId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<GithubContributionDay[]> {
    return mergeDays(
      await Promise.all(
        CODE_PROVIDERS.map((provider) => this.contributions(userId, provider, from, to)),
      ),
    );
  }

  private async withDays(userId: string): Promise<AccountWithDays[]> {
    const accounts: AccountWithDays[] = [];
    for (const provider of CODE_PROVIDERS) {
      const account = await this.account(userId, provider);
      if (account) {
        const days = await this.contributions(userId, provider, '0001-01-01', '9999-12-31');
        accounts.push({ account, days });
      }
    }
    return accounts;
  }
}
