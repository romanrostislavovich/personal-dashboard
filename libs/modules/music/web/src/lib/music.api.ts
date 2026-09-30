import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { MUSIC_READS, musicApi } from '@pd/client-core';
import {
  LastfmSettingsInput,
  MusicSettings,
  MusicStats,
  MusicTopPeriod,
  MusicTops,
  NowPlaying,
} from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The music requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class MusicApi {
  private readonly music = musicApi(inject(DASHBOARD_CLIENT).api);

  settings() {
    return httpResource<MusicSettings>(() => MUSIC_READS.settings());
  }

  stats() {
    return httpResource<MusicStats>(() => MUSIC_READS.stats());
  }

  tops(period: () => MusicTopPeriod) {
    return httpResource<MusicTops | null>(() => MUSIC_READS.tops(period()));
  }

  nowPlaying() {
    return httpResource<NowPlaying | null>(() => MUSIC_READS.nowPlaying());
  }

  connectLastfm(input: LastfmSettingsInput) {
    return fromCore(() => this.music.connectLastfm(input));
  }

  disconnectLastfm() {
    return fromCore(() => this.music.disconnectLastfm());
  }

  syncLastfm() {
    return fromCore(() => this.music.syncLastfm());
  }

  /** Starts importing the rest of the history; progress comes with `settings()`. */
  importLastfmHistory() {
    return fromCore(() => this.music.importLastfmHistory());
  }

  /** Spotify sign-in page URL — the browser has to navigate to it. */
  spotifyConnectUrl() {
    return fromCore(() => this.music.spotifyConnectUrl());
  }

  disconnectSpotify() {
    return fromCore(() => this.music.disconnectSpotify());
  }
}
