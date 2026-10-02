import {
  BitbucketTokenInput,
  CodeAccount,
  CodeAccountsSettings,
  CodeAccountsSummary,
  CodeProvider,
  GithubContributionDay,
  GithubProfile,
  GithubSettings,
  TokenProvider,
  TrackedRepo,
  TrackedRepoInput,
  TrackedRepoUpdate,
  WakatimePeriod,
  WakatimeSettings,
  WakatimeStats,
} from '@pd/contracts';
import { ApiClient, apiRequest } from '../api-client';

const BASE = '/api/development';

/** Read requests of the Development section (see ApiRequest). */
export const DEVELOPMENT_READS = {
  /** Open source repositories, by stars; hidden ones included. */
  repos: () => apiRequest(`${BASE}/repos`),
  /** Whether the GitHub token is set. */
  githubSettings: () => apiRequest(`${BASE}/github/settings`),
  /** The account of the token's owner; `null` until the first sync. */
  githubProfile: () => apiRequest(`${BASE}/github/profile`),
  /** The contribution calendar of a year. */
  githubContributions: (year: number) => apiRequest(`${BASE}/github/contributions`, { year }),
  /** Which code hosting services are connected. */
  accountsSettings: () => apiRequest(`${BASE}/accounts/settings`),
  /** The account on a service; `null` until the first sync. */
  account: (provider: CodeProvider) => apiRequest(`${BASE}/accounts/${provider}/profile`),
  /** The activity calendar of a year on a service. */
  accountContributions: (provider: CodeProvider, year: number) =>
    apiRequest(`${BASE}/accounts/${provider}/contributions`, { year }),
  /** All connected accounts as one; `null` — none is connected. */
  accountsSummary: () => apiRequest(`${BASE}/accounts/summary`),
  /** The common calendar of a year. */
  summaryContributions: (year: number) =>
    apiRequest(`${BASE}/accounts/summary/contributions`, { year }),
  wakatimeSettings: () => apiRequest(`${BASE}/wakatime/settings`),
  /** Coding time over the last `days` days. */
  wakatimeStats: (days: WakatimePeriod) => apiRequest(`${BASE}/wakatime/stats`, { days }),
};

export function developmentApi(api: ApiClient) {
  return {
    repos: () => api.read<TrackedRepo[]>(DEVELOPMENT_READS.repos()),
    addRepo: (input: TrackedRepoInput) => api.post<void>(`${BASE}/repos`, input),
    /** Hide or show, notifications, the npm package — only the fields sent change. */
    updateRepo: (id: string, update: TrackedRepoUpdate) =>
      api.patch<void>(`${BASE}/repos/${id}`, update),
    /** Only a repository added by hand; one of the account is hidden instead. */
    removeRepo: (id: string) => api.delete(`${BASE}/repos/${id}`),
    syncRepos: () => api.post<void>(`${BASE}/repos/sync-all`, {}),

    githubSettings: () => api.read<GithubSettings>(DEVELOPMENT_READS.githubSettings()),
    saveGithubToken: (token: string) => api.put<void>(`${BASE}/github/token`, { token }),
    removeGithubToken: () => api.delete(`${BASE}/github/token`),

    githubProfile: () => api.read<GithubProfile | null>(DEVELOPMENT_READS.githubProfile()),
    githubContributions: (year: number) =>
      api.read<GithubContributionDay[]>(DEVELOPMENT_READS.githubContributions(year)),
    syncGithubProfile: () => api.post<void>(`${BASE}/github/profile/sync`, {}),

    accountsSettings: () => api.read<CodeAccountsSettings>(DEVELOPMENT_READS.accountsSettings()),
    account: (provider: CodeProvider) =>
      api.read<CodeAccount | null>(DEVELOPMENT_READS.account(provider)),
    accountContributions: (provider: CodeProvider, year: number) =>
      api.read<GithubContributionDay[]>(DEVELOPMENT_READS.accountContributions(provider, year)),
    accountsSummary: () =>
      api.read<CodeAccountsSummary | null>(DEVELOPMENT_READS.accountsSummary()),
    summaryContributions: (year: number) =>
      api.read<GithubContributionDay[]>(DEVELOPMENT_READS.summaryContributions(year)),
    syncAccount: (provider: CodeProvider) =>
      api.post<void>(`${BASE}/accounts/${provider}/sync`, {}),
    /** The token is checked and the account it belongs to is loaded. */
    saveGitlabToken: (token: string) => api.put<void>(`${BASE}/accounts/gitlab/token`, { token }),
    saveBitbucketToken: (input: BitbucketTokenInput) =>
      api.put<void>(`${BASE}/accounts/bitbucket/token`, input),
    /** Disconnects GitLab or Bitbucket and forgets its account. */
    removeAccountToken: (provider: TokenProvider) =>
      api.delete(`${BASE}/accounts/${provider}/token`),

    wakatimeSettings: () => api.read<WakatimeSettings>(DEVELOPMENT_READS.wakatimeSettings()),
    wakatimeStats: (days: WakatimePeriod) =>
      api.read<WakatimeStats>(DEVELOPMENT_READS.wakatimeStats(days)),
    /** The key is checked and the days WakaTime still has are copied. */
    connectWakatime: (apiKey: string) => api.put<void>(`${BASE}/wakatime/key`, { apiKey }),
    disconnectWakatime: () => api.delete(`${BASE}/wakatime/key`),
    syncWakatime: () => api.post<void>(`${BASE}/wakatime/sync`, {}),
  };
}

export type DevelopmentClient = ReturnType<typeof developmentApi>;
