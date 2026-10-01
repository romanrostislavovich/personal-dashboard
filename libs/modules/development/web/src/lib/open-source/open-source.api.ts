import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { GITHUB_OSS_READS, githubOssApi } from '@pd/client-core';
import { GithubSettings, TrackedRepo, TrackedRepoInput } from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The open source requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class GithubOssApi {
  private readonly oss = githubOssApi(inject(DASHBOARD_CLIENT).api);

  repos() {
    return httpResource<TrackedRepo[]>(() => GITHUB_OSS_READS.repos(), { defaultValue: [] });
  }

  settings() {
    return httpResource<GithubSettings>(() => GITHUB_OSS_READS.settings());
  }

  addRepo(input: TrackedRepoInput) {
    return fromCore(() => this.oss.addRepo(input));
  }

  updateRepo(id: string, input: TrackedRepoInput) {
    return fromCore(() => this.oss.updateRepo(id, input));
  }

  removeRepo(id: string) {
    return fromCore(() => this.oss.removeRepo(id));
  }

  syncAll() {
    return fromCore(() => this.oss.syncAll());
  }

  saveToken(token: string) {
    return fromCore(() => this.oss.saveToken(token));
  }

  removeToken() {
    return fromCore(() => this.oss.removeToken());
  }
}
