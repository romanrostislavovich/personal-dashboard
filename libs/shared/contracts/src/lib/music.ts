import { z } from 'zod';
import { LocalDate } from './local-date';

export const lastfmSettingsInputSchema = z.object({
  username: z.string().trim().min(2).max(50),
  /** Last.fm application key: https://www.last.fm/api/account/create */
  apiKey: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{32}$/i, 'Expected a 32-character Last.fm API key'),
});
export type LastfmSettingsInput = z.infer<typeof lastfmSettingsInputSchema>;

export interface MusicSettings {
  lastfm: { username: string | null; lastSyncedAt: string | null; lastError: string | null };
  spotify: {
    /** SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are set on the server. */
    available: boolean;
    connected: boolean;
  };
}

export interface NowPlaying {
  source: 'spotify' | 'lastfm';
  track: string;
  artist: string;
  album: string | null;
  imageUrl: string | null;
  url: string | null;
  isPlaying: boolean;
  /** Spotify only. */
  progressMs: number | null;
  durationMs: number | null;
}

export const MUSIC_TOP_PERIODS = ['7day', '1month', '12month', 'overall'] as const;
export type MusicTopPeriod = (typeof MUSIC_TOP_PERIODS)[number];

export interface MusicTopItem {
  name: string;
  /** For tracks and albums. */
  artist: string | null;
  playcount: number;
  url: string;
  imageUrl: string | null;
}

export interface MusicTops {
  period: MusicTopPeriod;
  artists: MusicTopItem[];
  tracks: MusicTopItem[];
  albums: MusicTopItem[];
}

export interface RecentTrack {
  track: string;
  artist: string;
  album: string | null;
  playedAt: string;
}

export interface MusicStats {
  /** Total Last.fm scrobbles of all time. */
  totalScrobbles: number | null;
  today: number;
  /** Plays per day for the last 30 days (from the local history). */
  playsByDay: { day: LocalDate; plays: number }[];
  recent: RecentTrack[];
}
