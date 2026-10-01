import { httpResource } from '@angular/common/http';
import { inject, Injectable, Signal } from '@angular/core';
import { DEVELOPMENT_READS, developmentApi } from '@pd/client-core';
import { GithubContributionDay, GithubProfile, GithubSettings } from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The GitHub requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class GithubApi {
  private readonly development = developmentApi(inject(DASHBOARD_CLIENT).api);

  settings() {
    return httpResource<GithubSettings>(() => DEVELOPMENT_READS.githubSettings());
  }

  saveToken(token: string) {
    return fromCore(() => this.development.saveGithubToken(token));
  }

  removeToken() {
    return fromCore(() => this.development.removeGithubToken());
  }

  /** `null` until the first sync. */
  profile() {
    return httpResource<GithubProfile | null>(() => DEVELOPMENT_READS.githubProfile());
  }

  /** The calendar of the chosen year; reloads when the year changes. */
  contributions(year: Signal<number>) {
    return httpResource<GithubContributionDay[]>(
      () => DEVELOPMENT_READS.githubContributions(year()),
      { defaultValue: [] },
    );
  }

  syncProfile() {
    return fromCore(() => this.development.syncGithubProfile());
  }
}
