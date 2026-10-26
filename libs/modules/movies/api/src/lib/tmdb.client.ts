import { MovieKind, MovieSearchResult } from '@pd/contracts';

const BASE = 'https://api.themoviedb.org/3';
const POSTERS = 'https://image.tmdb.org/t/p/w185';
const TIMEOUT_MS = 15_000;

/** The key was refused: the user has to save another one. */
export class TmdbAuthError extends Error {}

/** A title's details as the dashboard keeps them. */
export interface TmdbDetails {
  tmdbId: number;
  kind: MovieKind;
  title: string;
  originalTitle: string | null;
  year: number | null;
  posterPath: string | null;
  genres: string[];
  runtimeMinutes: number | null;
}

interface TmdbItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
}

export function posterUrl(path: string | null): string | null {
  return path ? `${POSTERS}${path}` : null;
}

/**
 * TMDB (themoviedb.org), API v3. The key is the user's own: either the "API Key" (32 hex
 * characters, sent as `api_key`) or the "API Read Access Token" (a long JWT, sent as a bearer).
 */
export class TmdbClient {
  constructor(
    private readonly key: string,
    /** `ru-RU`, `en-US`: the titles and genres come in it. */
    private readonly language: string,
  ) {}

  /** Films and shows by a name; `kind` narrows it, `year` helps to pick. */
  async search(
    query: string,
    options: { kind?: MovieKind; year?: number | null } = {},
  ): Promise<MovieSearchResult[]> {
    const path =
      options.kind === 'movie'
        ? 'search/movie'
        : options.kind === 'tv'
          ? 'search/tv'
          : 'search/multi';
    const params: Record<string, string> = { query, include_adult: 'false' };
    if (options.year && options.kind === 'movie') {
      params['year'] = String(options.year);
    }
    if (options.year && options.kind === 'tv') {
      params['first_air_date_year'] = String(options.year);
    }
    const answer = await this.get<{ results?: TmdbItem[] }>(path, params);
    return (answer.results ?? []).flatMap((item) => {
      const kind = options.kind ?? item.media_type;
      return kind === 'movie' || kind === 'tv' ? [result(item, kind)] : [];
    });
  }

  async details(kind: MovieKind, tmdbId: number): Promise<TmdbDetails> {
    const item = await this.get<
      TmdbItem & {
        genres?: { name: string }[];
        runtime?: number | null;
        episode_run_time?: number[];
      }
    >(`${kind}/${tmdbId}`, {});
    const found = result(item, kind);
    const runtime = kind === 'movie' ? item.runtime : item.episode_run_time?.[0];
    return {
      tmdbId,
      kind,
      title: found.title,
      originalTitle: found.originalTitle,
      year: found.year,
      posterPath: item.poster_path ?? null,
      genres: (item.genres ?? []).map((genre) => genre.name).filter(Boolean),
      runtimeMinutes: runtime || null,
    };
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set('language', this.language);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value);
    }
    const headers: Record<string, string> = { accept: 'application/json' };
    if (/^[0-9a-f]{32}$/i.test(this.key)) {
      url.searchParams.set('api_key', this.key);
    } else {
      headers['authorization'] = `Bearer ${this.key}`;
    }
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status === 401) {
      throw new TmdbAuthError('TMDB refused the key');
    }
    if (!response.ok) {
      throw new Error(`TMDB ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    return (await response.json()) as T;
  }
}

function result(item: TmdbItem, kind: MovieKind): MovieSearchResult {
  const date = kind === 'movie' ? item.release_date : item.first_air_date;
  const title = (kind === 'movie' ? item.title : item.name) ?? item.title ?? item.name ?? '';
  const original = (kind === 'movie' ? item.original_title : item.original_name) ?? null;
  return {
    tmdbId: item.id,
    kind,
    title,
    originalTitle: original && original !== title ? original : null,
    year: date ? Number(date.slice(0, 4)) || null : null,
    posterUrl: posterUrl(item.poster_path ?? null),
    overview: item.overview || null,
  };
}
