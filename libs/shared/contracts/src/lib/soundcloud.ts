import { z } from 'zod';
import { LocalDate } from './local-date';

/**
 * The profile from what the user pasted: its link (`https://soundcloud.com/name`, with or
 * without a page after it) or the bare name of the address. `null` — not a profile.
 */
export function soundcloudProfileName(value: string): string | null {
  const link = value.trim().match(/^(?:https?:\/\/)?(?:www\.|m\.)?soundcloud\.com\/([^/?#]+)/i);
  const name = (link ? link[1] : value.trim()).toLowerCase();
  return /^[a-z0-9_-]{2,60}$/.test(name) ? name : null;
}

export const soundcloudConnectSchema = z.object({
  /** A link to the profile or the name from its address. */
  profile: z
    .string()
    .trim()
    .max(200)
    .refine((value) => soundcloudProfileName(value) !== null, 'Expected a SoundCloud profile'),
  /** The sign-in token of the account: private tracks are read with it. Optional. */
  token: z.string().trim().min(10).max(300).nullish(),
});
export type SoundcloudConnectInput = z.input<typeof soundcloudConnectSchema>;

/** `PATCH /api/music/soundcloud/tracks/:id` */
export const soundcloudTrackUpdateSchema = z.object({
  /** Tell about new comments and play milestones of the track. */
  notify: z.boolean(),
});
export type SoundcloudTrackUpdate = z.infer<typeof soundcloudTrackUpdateSchema>;

export interface SoundcloudSettings {
  /** The name from the profile's address; `null` — not connected. */
  username: string | null;
  /** A sign-in token is saved: private tracks are read too. */
  withToken: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

/** The counters SoundCloud shows under a track. */
export interface SoundcloudCounters {
  plays: number;
  likes: number;
  reposts: number;
  comments: number;
}

/** A history point: the counters at the end of the day. */
export interface SoundcloudPoint {
  day: LocalDate;
  plays: number;
  likes: number;
}

export interface SoundcloudTrack extends SoundcloudCounters {
  id: string;
  title: string;
  permalinkUrl: string;
  artworkUrl: string | null;
  isPrivate: boolean;
  /** When it was uploaded (ISO). */
  publishedAt: string;
  durationMs: number;
  genre: string | null;
  downloads: number;
  notify: boolean;
  /** Growth of plays over 7 and 30 days (from the saved history). */
  playsDelta: { week: number; month: number };
  /** The last 30 days, for the chart. */
  history: SoundcloudPoint[];
}

/** The user's own tracks on SoundCloud and what happens to them. */
export interface SoundcloudStats {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  permalinkUrl: string;
  followers: number;
  /** Followers gained over 7 days. */
  followersWeek: number;
  totals: SoundcloudCounters;
  playsDelta: { week: number; month: number };
  /** All tracks added up, the last 30 days. */
  history: SoundcloudPoint[];
  /** The most played first. */
  tracks: SoundcloudTrack[];
  /** Counters are saved since this day: SoundCloud gives no history of its own. */
  trackedSince: LocalDate | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}
