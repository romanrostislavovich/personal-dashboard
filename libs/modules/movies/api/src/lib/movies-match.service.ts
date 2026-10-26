import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { DB, Database, SecretsService, UsersService } from '@pd/api-core';
import {
  MovieAdd,
  movieAddSchema,
  MovieAssign,
  MovieKind,
  MovieSearchResult,
  MovieTitle,
  WatchHints,
  zonedDateTime,
} from '@pd/contracts';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { movieTitles, movieViews, MovieViewRow } from './movies.schema';
import { MoviesService, TMDB_KEY_SECRET } from './movies.service';
import { pickMatch } from './pick-match';
import { TmdbAuthError, TmdbClient, TmdbDetails } from './tmdb.client';
import { matchKey, WatchTitle, watchTitle } from './watch-title';

/** Views looked at in one run of `movies.match`. */
const BATCH = 200;

/**
 * Finding what a view was: the page's hints read into a title, the title looked up among the
 * user's own first (`match_keys`), then in TMDB with the user's key. Without a key a title is
 * kept as the page named it, and found in TMDB once a key is saved. Runs on the server only (the
 * job, and server actions for the user's own clicks).
 */
@Injectable()
export class MoviesMatchService {
  private readonly logger = new Logger(MoviesMatchService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly secrets: SecretsService,
    private readonly users: UsersService,
    private readonly movies: MoviesService,
  ) {}

  /** The views not looked at yet, of every user. */
  async resolvePending(): Promise<void> {
    const rows = await this.movies.unresolved(BATCH);
    const clients = new Map<string, TmdbClient | null>();
    for (const row of rows) {
      if (!clients.has(row.userId)) {
        clients.set(row.userId, await this.client(row.userId));
      }
      try {
        await this.resolve(row, clients.get(row.userId) ?? null);
      } catch (error) {
        if (error instanceof TmdbAuthError) {
          // The key went bad: found later, once the user saves a new one.
          clients.set(row.userId, null);
        }
        this.logger.warn(`A view was not looked up: ${(error as Error).message}`);
      }
    }
  }

  async search(userId: string, query: string): Promise<MovieSearchResult[]> {
    const client = await this.needClient(userId);
    return (await client.search(query)).slice(0, 20);
  }

  /** A title found in TMDB, into the list to watch (or as seen today). */
  async add(userId: string, input: MovieAdd): Promise<MovieTitle> {
    const { tmdbId, kind, wanted } = movieAddSchema.parse(input);
    const details = await (await this.needClient(userId)).details(kind, tmdbId);
    const id = await this.keep(userId, details, []);
    if (wanted) {
      await this.db
        .update(movieTitles)
        .set({ wantedAt: sql`coalesce(${movieTitles.wantedAt}, now())`, updatedAt: new Date() })
        .where(and(eq(movieTitles.id, id), isNull(movieTitles.watchedOn)));
    } else {
      await this.db
        .update(movieTitles)
        .set({ watchedOn: await this.today(userId), wantedAt: null, updatedAt: new Date() })
        .where(eq(movieTitles.id, id));
    }
    return this.movies.title(userId, id);
  }

  /** "This is it": a view not found by itself, and the others of the same name with it. */
  async assign(userId: string, viewId: string, input: MovieAssign): Promise<MovieTitle> {
    const view = await this.movies.view(userId, viewId);
    const read = readTitle(view);
    const key = matchKey(read?.name ?? view.name);
    const details = await (await this.needClient(userId)).details(input.kind, input.tmdbId);
    const id = await this.keep(userId, details, key ? [key] : []);
    const others = await this.db
      .select()
      .from(movieViews)
      .where(
        and(
          eq(movieViews.userId, userId),
          eq(movieViews.kind, 'unknown'),
          eq(movieViews.dismissed, false),
        ),
      );
    const same = others.filter(
      (row) => row.id === view.id || matchKey(readTitle(row)?.name ?? row.name) === key,
    );
    for (const row of same.length ? same : [view]) {
      await this.attach(row, id, details.kind, readTitle(row));
    }
    return this.movies.title(userId, id);
  }

  /** Checked with one search before it is kept; then everything not found is looked up again. */
  async setKey(userId: string, key: string): Promise<void> {
    const client = new TmdbClient(key, await this.language(userId));
    try {
      await client.search('Matrix');
    } catch (error) {
      if (error instanceof TmdbAuthError) {
        throw new BadRequestException('TMDB refused the key');
      }
      throw error;
    }
    await this.secrets.set(userId, TMDB_KEY_SECRET, key);
    await this.findAgain(userId, client);
  }

  async removeKey(userId: string): Promise<void> {
    await this.secrets.delete(userId, TMDB_KEY_SECRET);
  }

  /**
   * After a key is saved: the titles kept as pages named them are found in TMDB (their rating,
   * note and lists go along), and the views not found are looked at again by the job.
   */
  private async findAgain(userId: string, client: TmdbClient): Promise<void> {
    const local = await this.db
      .select()
      .from(movieTitles)
      .where(and(eq(movieTitles.userId, userId), isNull(movieTitles.tmdbId)));
    for (const title of local) {
      try {
        const results = await client.search(title.title, { kind: title.kind, year: title.year });
        const found = pickMatch(results, {
          name: title.title,
          year: title.year,
          episode: title.kind === 'tv' ? 0 : null,
        });
        if (!found) {
          continue;
        }
        const details = await client.details(found.kind, found.tmdbId);
        const id = await this.keep(userId, details, title.matchKeys);
        await this.db
          .update(movieTitles)
          .set({
            rating: sql`coalesce(${movieTitles.rating}, ${title.rating})`,
            note: sql`coalesce(${movieTitles.note}, ${title.note})`,
            watchedOn: sql`coalesce(${movieTitles.watchedOn}, ${title.watchedOn})`,
            wantedAt: sql`coalesce(${movieTitles.wantedAt}, ${title.wantedAt})`,
          })
          .where(eq(movieTitles.id, id));
        await this.db
          .update(movieViews)
          .set({ titleId: id })
          .where(eq(movieViews.titleId, title.id));
        await this.db.delete(movieTitles).where(eq(movieTitles.id, title.id));
      } catch (error) {
        this.logger.warn(`A title was not found again: ${(error as Error).message}`);
      }
    }
    await this.db
      .update(movieViews)
      .set({ resolvedAt: null })
      .where(
        and(
          eq(movieViews.userId, userId),
          eq(movieViews.kind, 'unknown'),
          eq(movieViews.dismissed, false),
        ),
      );
  }

  private async resolve(view: MovieViewRow, client: TmdbClient | null): Promise<void> {
    const read = readTitle(view);
    if (!read) {
      await this.mark(view, { kind: 'unknown' });
      return;
    }
    if (read.kind === 'video') {
      await this.mark(view, { kind: 'video', name: read.name });
      return;
    }
    const key = matchKey(read.name);
    const [own] = await this.db
      .select({ id: movieTitles.id, kind: movieTitles.kind })
      .from(movieTitles)
      .where(and(eq(movieTitles.userId, view.userId), sql`${key} = any(${movieTitles.matchKeys})`))
      .limit(1);
    if (own) {
      await this.attach(view, own.id, own.kind, read);
      return;
    }
    const kind: MovieKind = read.episode !== null ? 'tv' : 'movie';
    if (!client) {
      // No key: kept as the page named it.
      const [made] = await this.db
        .insert(movieTitles)
        .values({ userId: view.userId, kind, title: read.name, year: read.year, matchKeys: [key] })
        .returning({ id: movieTitles.id });
      await this.attach(view, made.id, kind, read);
      return;
    }
    const results = await client.search(read.name, {
      kind: read.episode !== null ? 'tv' : undefined,
      year: read.year,
    });
    const found = pickMatch(results, read);
    if (!found) {
      await this.mark(view, {
        kind: 'unknown',
        name: read.name,
        season: read.season,
        episode: read.episode,
      });
      return;
    }
    const details = await client.details(found.kind, found.tmdbId);
    const id = await this.keep(view.userId, details, [key]);
    await this.attach(view, id, details.kind, read);
  }

  /** The title of TMDB as the user's own (one row per TMDB id); the page titles that are it. */
  private async keep(userId: string, details: TmdbDetails, keys: string[]): Promise<string> {
    const own = [details.title, details.originalTitle]
      .filter((name): name is string => !!name)
      .map(matchKey);
    const matchKeys = [...new Set([...keys, ...own].filter(Boolean))];
    const [row] = await this.db
      .insert(movieTitles)
      .values({
        userId,
        tmdbId: details.tmdbId,
        kind: details.kind,
        title: details.title,
        originalTitle: details.originalTitle,
        year: details.year,
        posterPath: details.posterPath,
        genres: details.genres,
        runtimeMinutes: details.runtimeMinutes,
        matchKeys,
      })
      .onConflictDoUpdate({
        target: [movieTitles.userId, movieTitles.tmdbId],
        set: {
          title: details.title,
          originalTitle: details.originalTitle,
          year: details.year,
          posterPath: details.posterPath,
          genres: details.genres,
          runtimeMinutes: details.runtimeMinutes,
          matchKeys: sql`array(select distinct unnest(${movieTitles.matchKeys} || excluded.match_keys))`,
        },
      })
      .returning({ id: movieTitles.id });
    return row.id;
  }

  private async attach(
    view: MovieViewRow,
    titleId: string,
    kind: MovieKind,
    read: WatchTitle | null,
  ): Promise<void> {
    await this.mark(view, {
      kind: kind === 'tv' ? 'episode' : 'movie',
      titleId,
      name: read?.name ?? view.name,
      season: read?.season ?? null,
      episode: read?.episode ?? null,
    });
    await this.db
      .update(movieTitles)
      .set({ updatedAt: new Date() })
      .where(eq(movieTitles.id, titleId));
    await this.movies.markSeenIfWatched(view.userId, titleId);
  }

  private async mark(
    view: MovieViewRow,
    set: Partial<Pick<MovieViewRow, 'kind' | 'titleId' | 'name' | 'season' | 'episode'>>,
  ): Promise<void> {
    await this.db
      .update(movieViews)
      .set({ ...set, resolvedAt: new Date() })
      .where(inArray(movieViews.id, [view.id]));
  }

  private async client(userId: string): Promise<TmdbClient | null> {
    const key = await this.secrets.get(userId, TMDB_KEY_SECRET);
    return key ? new TmdbClient(key, await this.language(userId)) : null;
  }

  private async needClient(userId: string): Promise<TmdbClient> {
    const client = await this.client(userId);
    if (!client) {
      throw new BadRequestException('No TMDB key');
    }
    return client;
  }

  private async language(userId: string): Promise<string> {
    const user = await this.users.findById(userId);
    return user?.locale === 'ru' ? 'ru-RU' : 'en-US';
  }

  private async today(userId: string): Promise<string> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    return zonedDateTime(new Date(), timeZone).date;
  }
}

function readTitle(view: MovieViewRow): WatchTitle | null {
  let hints: WatchHints = {};
  try {
    hints = JSON.parse(view.hints) as WatchHints;
  } catch {
    // An old or broken row: only its site and name.
  }
  return watchTitle(view.site, hints);
}
