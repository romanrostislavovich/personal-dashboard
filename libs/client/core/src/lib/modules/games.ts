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
    /** Every game account now, Dota with its whole history. */
    syncAll: () => api.post<void>(`${BASE}/sync`, {}),
    remove: (id: string) => api.delete(`${BASE}/accounts/${id}`),
    /** The Steam Web API key: it is checked and every account is refreshed with it. */
    saveSteamKey: (apiKey: string) => api.put<void>(`${BASE}/steam/key`, { apiKey }),
    removeSteamKey: () => api.delete(`${BASE}/steam/key`),
    saveWowCredentials: (input: WowCredentialsInput) =>
      api.put<void>(`${BASE}/wow/credentials`, input),
    /** The key of one Dota account: it is checked and the account is refreshed with it. */
    saveOpenDotaKey: (accountId: string, apiKey: string) =>
      api.put<void>(`${BASE}/accounts/${accountId}/opendota-key`, { apiKey }),
    removeOpenDotaKey: (accountId: string) =>
      api.delete(`${BASE}/accounts/${accountId}/opendota-key`),
  };
}

export type GamesClient = ReturnType<typeof gamesApi>;
