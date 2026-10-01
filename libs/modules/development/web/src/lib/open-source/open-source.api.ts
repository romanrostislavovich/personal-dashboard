import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { DEVELOPMENT_READS, developmentApi } from '@pd/client-core';
import { TrackedRepo, TrackedRepoInput, TrackedRepoUpdate } from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The open source requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class OpenSourceApi {
  private readonly development = developmentApi(inject(DASHBOARD_CLIENT).api);

  /** All repositories, hidden ones included: the page filters them itself. */
  repos() {
    return httpResource<TrackedRepo[]>(() => DEVELOPMENT_READS.repos(), { defaultValue: [] });
  }

  /** A repository the account does not bring by itself. */
  addRepo(input: TrackedRepoInput) {
    return fromCore(() => this.development.addRepo(input));
  }

  /** Hide or show, notifications, the npm package — only the fields sent change. */
  updateRepo(id: string, update: TrackedRepoUpdate) {
    return fromCore(() => this.development.updateRepo(id, update));
  }

  removeRepo(id: string) {
    return fromCore(() => this.development.removeRepo(id));
  }

  syncAll() {
    return fromCore(() => this.development.syncRepos());
  }
}
