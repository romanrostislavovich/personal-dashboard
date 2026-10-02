import {
  LastfmSettingsInput,
  MusicSettings,
  MusicStats,
  MusicTopPeriod,
  MusicTops,
  NowPlaying,
  SoundcloudConnectInput,
  SoundcloudStats,
  SoundcloudTrackUpdate,
} from '@pd/contracts';
import { ApiClient, apiRequest } from '../api-client';

const BASE = '/api/music';

/** Read requests of music (see ApiRequest). */
export const MUSIC_READS = {
  settings: () => apiRequest(`${BASE}/settings`),
  stats: () => apiRequest(`${BASE}/stats`),
  tops: (period: MusicTopPeriod) => apiRequest(`${BASE}/tops`, { period }),
  nowPlaying: () => apiRequest(`${BASE}/now-playing`),
  /** The user's own tracks on SoundCloud; `null` — not connected. */
  soundcloud: () => apiRequest(`${BASE}/soundcloud`),
};

export function musicApi(api: ApiClient) {
  return {
    settings: () => api.read<MusicSettings>(MUSIC_READS.settings()),
    stats: () => api.read<MusicStats>(MUSIC_READS.stats()),
    tops: (period: MusicTopPeriod) => api.read<MusicTops | null>(MUSIC_READS.tops(period)),
    nowPlaying: () => api.read<NowPlaying | null>(MUSIC_READS.nowPlaying()),

    connectLastfm: (input: LastfmSettingsInput) => api.put<void>(`${BASE}/lastfm`, input),
    disconnectLastfm: () => api.delete(`${BASE}/lastfm`),
    syncLastfm: () => api.post<void>(`${BASE}/lastfm/sync`, {}),
    /** Starts importing the rest of the history; progress comes with `settings`. */
    importLastfmHistory: () => api.post<void>(`${BASE}/lastfm/history`, {}),
    /** The Spotify sign-in page the user has to open. */
    spotifyConnectUrl: () => api.post<{ url: string }>(`${BASE}/spotify/connect`, {}),
    disconnectSpotify: () => api.delete(`${BASE}/spotify`),

    soundcloud: () => api.read<SoundcloudStats | null>(MUSIC_READS.soundcloud()),
    /** Finds the profile and loads its tracks right away. */
    connectSoundcloud: (input: SoundcloudConnectInput) =>
      api.put<void>(`${BASE}/soundcloud`, input),
    /** Forgets the profile, its tracks and their history. */
    disconnectSoundcloud: () => api.delete(`${BASE}/soundcloud`),
    syncSoundcloud: () => api.post<void>(`${BASE}/soundcloud/sync`, {}),
    updateSoundcloudTrack: (id: string, update: SoundcloudTrackUpdate) =>
      api.patch<void>(`${BASE}/soundcloud/tracks/${id}`, update),
  };
}

export type MusicClient = ReturnType<typeof musicApi>;
