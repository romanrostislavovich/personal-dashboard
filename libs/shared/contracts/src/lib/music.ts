import { z } from 'zod';
import { LocalDate } from './local-date';
import { SoundcloudSettings } from './soundcloud';

export const lastfmSettingsInputSchema = z.object({
  username: z.string().trim().min(2).max(50),
  /** Last.fm application key: https://www.last.fm/api/account/create */
  apiKey: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{32}$/i, 'Expected a 32-character Last.fm API key'),
});
export type LastfmSettingsInput = z.infer<typeof lastfmSettingsInputSchema>;

/** Importing the whole Last.fm history into the local database. */
export interface LastfmHistoryStatus {
  /** Plays stored locally. */
  imported: number;
  /** Plays on Last.fm of all time; null if Last.fm did not answer. */
  total: number | null;
  complete: boolean;
  running: boolean;
}

export interface MusicSettings {
  lastfm: {
    username: string | null;
    lastSyncedAt: string | null;
    lastError: string | null;
    /** null — Last.fm is not connected. */
    history: LastfmHistoryStatus | null;
  };
  spotify: {
    /** The owner set the keys of the server's Spotify app (Settings → Integrations). */
    available: boolean;
    connected: boolean;
    /** For the owner, who sets the app; `null` for the others. */
    app: SpotifyAppState | null;
  };
  soundcloud: SoundcloudSettings;
}

export interface SpotifyAppState {
  clientId: string | null;
  /** What to put into the app's Redirect URIs at developer.spotify.com. */
  redirectUri: string;
}

/** `PUT /api/music/spotify/app`: the keys of an app at developer.spotify.com. */
export const spotifyAppInputSchema = z.object({
  clientId: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{32}$/i),
  clientSecret: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{32}$/i),
});
export type SpotifyAppInput = z.infer<typeof spotifyAppInputSchema>;

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

/** Where a song opens to be listened to or sent. */
export interface SongLinks {
  youtubeMusic: string;
  spotify: string;
  /** Straight to the song; otherwise a link to the search of the service. */
  youtubeMusicExact: boolean;
  spotifyExact: boolean;
}

/** `GET /api/music/song-links`: the song to find. */
export const songLinksQuerySchema = z.object({
  track: z.string().trim().min(1).max(300),
  artist: z.string().trim().max(300).optional(),
  /** A link known already (Spotify's, for the song playing). */
  url: z.url().optional(),
});
export type SongLinksQuery = z.infer<typeof songLinksQuerySchema>;

/**
 * The links of a song to the search of YouTube Music and Spotify (by "artist title"), until
 * the server finds the song itself; a Spotify link known already is used as it is.
 */
export function songLinks(song: {
  track: string;
  artist: string | null;
  url?: string | null;
}): SongLinks {
  const query = [song.artist, song.track].filter(Boolean).join(' ');
  const spotifyTrack = Boolean(song.url && /^https:\/\/open\.spotify\.com\/track\//.test(song.url));
  return {
    youtubeMusic: `https://music.youtube.com/search?q=${encodeURIComponent(query)}`,
    spotify: spotifyTrack
      ? (song.url as string)
      : `https://open.spotify.com/search/${encodeURIComponent(query)}`,
    youtubeMusicExact: false,
    spotifyExact: spotifyTrack,
  };
}
