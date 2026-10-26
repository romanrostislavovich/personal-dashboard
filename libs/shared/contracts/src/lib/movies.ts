import { z } from 'zod';
import { LocalDate } from './local-date';

/*
 * Movies and TV shows: what was watched — caught by the browser extension on any site that plays
 * a video (Netflix, YouTube, a site with a player of its own) — rated, noted, and the list of
 * what to watch. A film or a show is found in TMDB (themoviedb.org) by the user's own key.
 */

const moment = z.iso.datetime({ offset: true });
const hint = z.string().trim().max(300).optional();

/** What the page tells about the video playing; the server reads the title out of it. */
export const watchHintsSchema = z.object({
  /** `document.title` of the page (not of a player's frame). */
  pageTitle: hint,
  /** `og:title` of the page. */
  ogTitle: hint,
  /** The page's first heading. */
  heading: hint,
  /** The player's own title (Netflix, YouTube): the most exact one. */
  playerTitle: hint,
  /** The line under it: "S1:E3 The episode", a channel. */
  playerSubtitle: hint,
});
export type WatchHints = z.infer<typeof watchHintsSchema>;

/** A stretch of watching one video on one page, as the extension saw it. */
export const watchViewInputSchema = z.object({
  /** Made by the extension: a view sent again (it grew) is updated, not added. */
  id: z.uuid(),
  /** The page's site (`kinogo.biz`), never its address. */
  site: z.string().trim().toLowerCase().min(1).max(253),
  hints: watchHintsSchema,
  startedAt: moment,
  endedAt: moment,
  /** Seconds the video actually played. */
  watchedSeconds: z
    .number()
    .int()
    .min(0)
    .max(24 * 3600),
  /** Where the video stood last, and how long it is (null — a stream without an end). */
  positionSeconds: z
    .number()
    .min(0)
    .max(48 * 3600),
  durationSeconds: z
    .number()
    .min(0)
    .max(48 * 3600)
    .nullable(),
});
export type WatchViewInput = z.infer<typeof watchViewInputSchema>;

export const watchIngestSchema = z.object({ views: z.array(watchViewInputSchema).max(200) });
export type WatchIngest = z.infer<typeof watchIngestSchema>;

/** The answer to the extension: whether to watch at all, and the sites to leave alone. */
export interface WatchConfig {
  track: boolean;
  ignoredSites: string[];
}

export const movieSettingsSchema = z.object({
  track: z.boolean(),
  ignoredSites: z.array(z.string().trim().toLowerCase().min(1).max(253)).max(200),
});
export type MovieSettings = z.infer<typeof movieSettingsSchema>;

export const MOVIE_KINDS = ['movie', 'tv'] as const;
export type MovieKind = (typeof MOVIE_KINDS)[number];

/** A film or a show found in TMDB. */
export interface MovieSearchResult {
  tmdbId: number;
  kind: MovieKind;
  title: string;
  originalTitle: string | null;
  year: number | null;
  /** `https://image.tmdb.org/t/p/w185/...`. */
  posterUrl: string | null;
  overview: string | null;
}

/** A film or a show of the user's: watched, being watched, or wanted. */
export interface MovieTitle {
  id: string;
  tmdbId: number | null;
  kind: MovieKind;
  title: string;
  originalTitle: string | null;
  year: number | null;
  posterUrl: string | null;
  genres: string[];
  runtimeMinutes: number | null;
  /** In the list "to watch" since. */
  wantedAt: string | null;
  /** Seen to the end (by the views, or marked). */
  watchedOn: LocalDate | null;
  /** 1–10. */
  rating: number | null;
  note: string | null;
  /** Of the views: how long, how many episodes, the last one. */
  watchedSeconds: number;
  episodes: number;
  lastWatchedAt: string | null;
  /** The furthest episode seen: "S2E5". */
  lastEpisode: { season: number; episode: number } | null;
}

export const MOVIE_VIEW_KINDS = ['movie', 'episode', 'video', 'unknown'] as const;
export type MovieViewKind = (typeof MOVIE_VIEW_KINDS)[number];

/** One view: a film, an episode, a video (YouTube), or a title not found yet. */
export interface MovieView {
  id: string;
  kind: MovieViewKind;
  titleId: string | null;
  site: string;
  /** The title read from the page. */
  name: string;
  season: number | null;
  episode: number | null;
  startedAt: string;
  endedAt: string;
  watchedSeconds: number;
  positionSeconds: number;
  durationSeconds: number | null;
}

export const movieTitleUpdateSchema = z.object({
  rating: z.number().int().min(1).max(10).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  wanted: z.boolean().optional(),
  watchedOn: z.iso.date().nullable().optional(),
});
export type MovieTitleUpdate = z.infer<typeof movieTitleUpdateSchema>;

/** A title found in TMDB, added to the list "to watch" (or as watched). */
export const movieAddSchema = z.object({
  tmdbId: z.number().int().positive(),
  kind: z.enum(MOVIE_KINDS),
  wanted: z.boolean().default(true),
});
export type MovieAdd = z.input<typeof movieAddSchema>;

/** A view not found by itself: the film or the show it was. */
export const movieAssignSchema = z.object({
  tmdbId: z.number().int().positive(),
  kind: z.enum(MOVIE_KINDS),
});
export type MovieAssign = z.infer<typeof movieAssignSchema>;

export const movieSearchQuerySchema = z.object({ q: z.string().trim().min(1).max(200) });

export const movieViewsQuerySchema = z.object({
  /** `unknown` — the views waiting to be found; `video` — YouTube and the like. */
  kind: z.enum(['unknown', 'video', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export interface MovieViewsQuery {
  kind?: 'unknown' | 'video' | 'all';
  limit?: number;
}

export interface MoviesStatus {
  /** The TMDB key is saved: titles are found by themselves, the search works. */
  tmdb: boolean;
  settings: MovieSettings;
  /** Views waiting to be found. */
  unknown: number;
}

export const tmdbKeySchema = z.object({ key: z.string().trim().min(20).max(400) });
