import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { DEVELOPMENT_READS, developmentApi } from '@pd/client-core';
import { GithubSettings } from '@pd/contracts';
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
}
