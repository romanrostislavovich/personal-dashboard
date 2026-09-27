import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  LastfmSettingsInput,
  MusicSettings,
  MusicStats,
  MusicTopPeriod,
  MusicTops,
  NowPlaying,
} from '@pd/contracts';

const BASE = '/api/music';

@Injectable({ providedIn: 'root' })
export class MusicApi {
  private readonly http = inject(HttpClient);

  settings() {
    return httpResource<MusicSettings>(() => `${BASE}/settings`);
  }

  stats() {
    return httpResource<MusicStats>(() => `${BASE}/stats`);
  }

  tops(period: () => MusicTopPeriod) {
    return httpResource<MusicTops | null>(() => ({
      url: `${BASE}/tops`,
      params: { period: period() },
    }));
  }

  nowPlaying() {
    return httpResource<NowPlaying | null>(() => `${BASE}/now-playing`);
  }

  connectLastfm(input: LastfmSettingsInput) {
    return this.http.put<void>(`${BASE}/lastfm`, input);
  }

  disconnectLastfm() {
    return this.http.delete<void>(`${BASE}/lastfm`);
  }

  syncLastfm() {
    return this.http.post<void>(`${BASE}/lastfm/sync`, {});
  }

  /** Адрес страницы входа Spotify — на него нужно перейти браузером. */
  spotifyConnectUrl() {
    return this.http.post<{ url: string }>(`${BASE}/spotify/connect`, {});
  }

  disconnectSpotify() {
    return this.http.delete<void>(`${BASE}/spotify`);
  }
}
