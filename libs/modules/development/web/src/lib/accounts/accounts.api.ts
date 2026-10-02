import { httpResource } from '@angular/common/http';
import { inject, Injectable, Signal } from '@angular/core';
import { DEVELOPMENT_READS, developmentApi } from '@pd/client-core';
import {
  BitbucketTokenInput,
  CodeAccount,
  CodeAccountsSettings,
  CodeAccountsSummary,
  CodeProvider,
  GithubContributionDay,
  TokenProvider,
} from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The account requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class AccountsApi {
  private readonly development = developmentApi(inject(DASHBOARD_CLIENT).api);

  /** Which services have a token. */
  settings() {
    return httpResource<CodeAccountsSettings>(() => DEVELOPMENT_READS.accountsSettings());
  }

  /** `null` until the first sync. */
  account(provider: CodeProvider) {
    return httpResource<CodeAccount | null>(() => DEVELOPMENT_READS.account(provider));
  }

  /** The calendar of the chosen year; reloads when the year changes. */
  contributions(provider: CodeProvider, year: Signal<number>) {
    return httpResource<GithubContributionDay[]>(
      () => DEVELOPMENT_READS.accountContributions(provider, year()),
      { defaultValue: [] },
    );
  }

  /** All connected accounts as one; `null` — none is connected. */
  summary() {
    return httpResource<CodeAccountsSummary | null>(() => DEVELOPMENT_READS.accountsSummary());
  }

  summaryContributions(year: Signal<number>) {
    return httpResource<GithubContributionDay[]>(
      () => DEVELOPMENT_READS.summaryContributions(year()),
      { defaultValue: [] },
    );
  }

  sync(provider: CodeProvider) {
    return fromCore(() => this.development.syncAccount(provider));
  }

  saveGitlabToken(token: string) {
    return fromCore(() => this.development.saveGitlabToken(token));
  }

  saveBitbucketToken(input: BitbucketTokenInput) {
    return fromCore(() => this.development.saveBitbucketToken(input));
  }

  removeToken(provider: TokenProvider) {
    return fromCore(() => this.development.removeAccountToken(provider));
  }
}
