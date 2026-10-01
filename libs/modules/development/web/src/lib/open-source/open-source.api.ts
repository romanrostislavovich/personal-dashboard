import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { DEVELOPMENT_READS, developmentApi } from '@pd/client-core';
import { TrackedRepo, TrackedRepoInput } from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The open source requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class OpenSourceApi {
  private readonly development = developmentApi(inject(DASHBOARD_CLIENT).api);

  repos() {
    return httpResource<TrackedRepo[]>(() => DEVELOPMENT_READS.repos(), { defaultValue: [] });
  }

  addRepo(input: TrackedRepoInput) {
    return fromCore(() => this.development.addRepo(input));
  }

  updateRepo(id: string, input: TrackedRepoInput) {
    return fromCore(() => this.development.updateRepo(id, input));
  }

  removeRepo(id: string) {
    return fromCore(() => this.development.removeRepo(id));
  }

  syncAll() {
    return fromCore(() => this.development.syncRepos());
  }
}
