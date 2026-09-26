import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { GithubSettings, TrackedRepo, TrackedRepoInput } from '@pd/contracts';

const BASE = '/api/github-oss';

@Injectable({ providedIn: 'root' })
export class GithubOssApi {
  private readonly http = inject(HttpClient);

  repos() {
    return httpResource<TrackedRepo[]>(() => `${BASE}/repos`, { defaultValue: [] });
  }

  settings() {
    return httpResource<GithubSettings>(() => `${BASE}/settings`);
  }

  addRepo(input: TrackedRepoInput) {
    return this.http.post<void>(`${BASE}/repos`, input);
  }

  removeRepo(id: string) {
    return this.http.delete<void>(`${BASE}/repos/${id}`);
  }

  syncAll() {
    return this.http.post<void>(`${BASE}/sync`, {});
  }

  saveToken(token: string) {
    return this.http.put<void>(`${BASE}/token`, { token });
  }

  removeToken() {
    return this.http.delete<void>(`${BASE}/token`);
  }
}
