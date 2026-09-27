import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { GameAccount, GameAccountInput, GamesSettings, WowCredentialsInput } from '@pd/contracts';

const BASE = '/api/games';

@Injectable({ providedIn: 'root' })
export class GamesApi {
  private readonly http = inject(HttpClient);

  accounts() {
    return httpResource<GameAccount[]>(() => `${BASE}/accounts`, { defaultValue: [] });
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
