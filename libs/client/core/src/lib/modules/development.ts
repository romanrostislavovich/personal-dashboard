import {
  GithubContributionDay,
  GithubProfile,
  GithubSettings,
  TrackedRepo,
  TrackedRepoInput,
} from '@pd/contracts';
import { ApiClient, apiRequest } from '../api-client';

const BASE = '/api/development';

/** Read requests of the Development section (see ApiRequest). */
export const DEVELOPMENT_READS = {
  /** Tracked open source repositories, by stars. */
  repos: () => apiRequest(`${BASE}/repos`),
  /** Whether the GitHub token is set. */
  githubSettings: () => apiRequest(`${BASE}/github/settings`),
  /** The account of the token's owner; `null` until the first sync. */
  githubProfile: () => apiRequest(`${BASE}/github/profile`),
  /** The contribution calendar of a year. */
  githubContributions: (year: number) => apiRequest(`${BASE}/github/contributions`, { year }),
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

    githubProfile: () => api.read<GithubProfile | null>(DEVELOPMENT_READS.githubProfile()),
    githubContributions: (year: number) =>
      api.read<GithubContributionDay[]>(DEVELOPMENT_READS.githubContributions(year)),
    syncGithubProfile: () => api.post<void>(`${BASE}/github/profile/sync`, {}),
  };
}

export type DevelopmentClient = ReturnType<typeof developmentApi>;
