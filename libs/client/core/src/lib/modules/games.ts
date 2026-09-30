import {
  DotaMatchesPage,
  DotaMatchesQuery,
  DotaOverview,
  GameAccount,
  GameAccountInput,
  GamesSettings,
  WowCredentialsInput,
} from '@pd/contracts';
import { ApiClient, apiRequest } from '../api-client';

const BASE = '/api/games';

/** Read requests of games (see ApiRequest). */
export const GAMES_READS = {
  accounts: () => apiRequest(`${BASE}/accounts`),
  /** One Dota account, or `null` — all of them together. */
  dotaOverview: (accountId: string | null) => apiRequest(`${BASE}/dota/overview`, { accountId }),
  dotaMatches: (query: Partial<DotaMatchesQuery>) => apiRequest(`${BASE}/dota/matches`, query),
  settings: () => apiRequest(`${BASE}/settings`),
};

export function gamesApi(api: ApiClient) {
  return {
    accounts: () => api.read<GameAccount[]>(GAMES_READS.accounts()),
    dotaOverview: (accountId: string | null) =>
      api.read<DotaOverview>(GAMES_READS.dotaOverview(accountId)),
    dotaMatches: (query: Partial<DotaMatchesQuery>) =>
      api.read<DotaMatchesPage>(GAMES_READS.dotaMatches(query)),
    settings: () => api.read<GamesSettings>(GAMES_READS.settings()),

    add: (input: GameAccountInput) => api.post<void>(`${BASE}/accounts`, input),
    sync: (id: string) => api.post<void>(`${BASE}/accounts/${id}/sync`, {}),
    remove: (id: string) => api.delete(`${BASE}/accounts/${id}`),
    saveWowCredentials: (input: WowCredentialsInput) =>
      api.put<void>(`${BASE}/wow/credentials`, input),
  };
}

export type GamesClient = ReturnType<typeof gamesApi>;
