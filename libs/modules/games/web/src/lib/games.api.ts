import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { GAMES_READS, gamesApi } from '@pd/client-core';
import {
  DotaMatchesPage,
  DotaMatchesQuery,
  DotaOverview,
  GameAccount,
  GameAccountInput,
  GamesSettings,
  WowCredentialsInput,
} from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The games requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class GamesApi {
  private readonly games = gamesApi(inject(DASHBOARD_CLIENT).api);

  accounts() {
    return httpResource<GameAccount[]>(() => GAMES_READS.accounts(), { defaultValue: [] });
  }

  /** `accountId()` → one account; `null` → all Dota accounts together. */
  dotaOverview(accountId: () => string | null) {
    return httpResource<DotaOverview>(() => GAMES_READS.dotaOverview(accountId()));
  }

  dotaMatches(query: () => Partial<DotaMatchesQuery>) {
    return httpResource<DotaMatchesPage>(() => GAMES_READS.dotaMatches(query()));
  }

  settings() {
    return httpResource<GamesSettings>(() => GAMES_READS.settings());
  }

  add(input: GameAccountInput) {
    return fromCore(() => this.games.add(input));
  }

  sync(id: string) {
    return fromCore(() => this.games.sync(id));
  }

  syncAll() {
    return fromCore(() => this.games.syncAll());
  }

  remove(id: string) {
    return fromCore(() => this.games.remove(id));
  }

  saveSteamKey(apiKey: string) {
    return fromCore(() => this.games.saveSteamKey(apiKey));
  }

  removeSteamKey() {
    return fromCore(() => this.games.removeSteamKey());
  }

  saveWowCredentials(input: WowCredentialsInput) {
    return fromCore(() => this.games.saveWowCredentials(input));
  }

  saveOpenDotaKey(accountId: string, apiKey: string) {
    return fromCore(() => this.games.saveOpenDotaKey(accountId, apiKey));
  }

  removeOpenDotaKey(accountId: string) {
    return fromCore(() => this.games.removeOpenDotaKey(accountId));
  }
}
