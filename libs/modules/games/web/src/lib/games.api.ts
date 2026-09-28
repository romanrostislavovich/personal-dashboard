import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  DotaMatchesPage,
  DotaMatchesQuery,
  DotaOverview,
  GameAccount,
  GameAccountInput,
  GamesSettings,
  WowCredentialsInput,
} from '@pd/contracts';

const BASE = '/api/games';

@Injectable({ providedIn: 'root' })
export class GamesApi {
  private readonly http = inject(HttpClient);

  accounts() {
    return httpResource<GameAccount[]>(() => `${BASE}/accounts`, { defaultValue: [] });
  }

  /** `accountId()` → one account; `null` → all Dota accounts together. */
  dotaOverview(accountId: () => string | null) {
    return httpResource<DotaOverview>(() => ({
      url: `${BASE}/dota/overview`,
      params: withoutEmpty({ accountId: accountId() }),
    }));
  }

  dotaMatches(query: () => Partial<DotaMatchesQuery>) {
    return httpResource<DotaMatchesPage>(() => ({
      url: `${BASE}/dota/matches`,
      params: withoutEmpty(query()),
    }));
  }

  settings() {
    return httpResource<GamesSettings>(() => `${BASE}/settings`);
  }

  add(input: GameAccountInput) {
    return this.http.post<void>(`${BASE}/accounts`, input);
  }

  sync(id: string) {
    return this.http.post<void>(`${BASE}/accounts/${id}/sync`, {});
  }

  remove(id: string) {
    return this.http.delete<void>(`${BASE}/accounts/${id}`);
  }

  saveWowCredentials(input: WowCredentialsInput) {
    return this.http.put<void>(`${BASE}/wow/credentials`, input);
  }
}

/** Query parameters without the unset ones. */
function withoutEmpty(params: Record<string, string | number | null | undefined>) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== null && value !== undefined),
  ) as Record<string, string | number>;
}
