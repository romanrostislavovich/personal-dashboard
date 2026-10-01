import { GithubSettings, TrackedRepo, TrackedRepoInput } from '@pd/contracts';
import { ApiClient, apiRequest } from '../api-client';

const BASE = '/api/development';

/** Read requests of the Development section (see ApiRequest). */
export const DEVELOPMENT_READS = {
  /** Tracked open source repositories, by stars. */
  repos: () => apiRequest(`${BASE}/repos`),
  /** Whether the GitHub token is set. */
  githubSettings: () => apiRequest(`${BASE}/github/settings`),
};

export function developmentApi(api: ApiClient) {
  return {
    repos: () => api.read<TrackedRepo[]>(DEVELOPMENT_READS.repos()),
    addRepo: (input: TrackedRepoInput) => api.post<void>(`${BASE}/repos`, input),
    updateRepo: (id: string, input: TrackedRepoInput) =>
      api.put<void>(`${BASE}/repos/${id}`, input),
    removeRepo: (id: string) => api.delete(`${BASE}/repos/${id}`),
    syncRepos: () => api.post<void>(`${BASE}/repos/sync-all`, {}),

    githubSettings: () => api.read<GithubSettings>(DEVELOPMENT_READS.githubSettings()),
    saveGithubToken: (token: string) => api.put<void>(`${BASE}/github/token`, { token }),
    removeGithubToken: () => api.delete(`${BASE}/github/token`),
  };
}

export type DevelopmentClient = ReturnType<typeof developmentApi>;
