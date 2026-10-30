import {Inject, Injectable, NotFoundException} from '@nestjs/common';
import {DB, Database, SecretsService, UsersService} from '@pd/api-core';
import {
  MovieSettings,
  MoviesStatus,
  MovieTitle,
  MovieTitleUpdate,
  MovieView,
  MovieViewsQuery,
  movieViewsQuerySchema,
  WatchConfig,
  WatchViewInput,
  zonedDateTime,
} from '@pd/contracts';
import {and, desc, eq, inArray, isNotNull, isNull, or, sql} from 'drizzle-orm';
import {
  movieSettings,
  movieTitles,
  MovieTitleRow,
  movieViews,
  MovieViewRow,
} from './movies.schema';
import {posterUrl} from './tmdb.client';
import {isVideoSite} from './watch-title';

export const TMDB_KEY_SECRET = 'movies.tmdb-key';

/** A video this short on a site of films is a trailer or an advert, not a film. */
const MIN_FILM_SECONDS = 10 * 60;
/** A video this short on YouTube is a Short. */
const MIN_VIDEO_SECONDS = 60;

const DEFAULT_SETTINGS: MovieSettings = {track: true, ignoredSites: []};

/**
 * Movies and TV shows: the views the extension sends, the titles they are of, the ratings and
 * notes, the list to watch. Finding a view's title in TMDB is MoviesMatchService's work.
 */
@Injectable()
export class MoviesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly secrets: SecretsService,
    private readonly users: UsersService,
  ) {}

  async settings(userId: string): Promise<MovieSettings> {
    const [row] = await this.db
      .select({
        track: movieSettings.track,
        ignoredSites: movieSettings.ignoredSites,
      })
      .from(movieSettings)
      .where(eq(movieSettings.userId, userId));
    return row ?? DEFAULT_SETTINGS;
  }

  /** A site newly left alone loses its views: the user did not want them kept. */
  async setSettings(
    userId: string,
    settings: MovieSettings,
  ): Promise<MovieSettings> {
    const ignoredSites = [...new Set(settings.ignoredSites)];
    await this.db
      .insert(movieSettings)
      .values({userId, track: settings.track, ignoredSites})
      .onConflictDoUpdate({
        target: movieSettings.userId,
        set: {track: settings.track, ignoredSites},
      });
    if (ignoredSites.length) {
      await this.db
        .delete(movieViews)
        .where(
          and(
            eq(movieViews.userId, userId),
            inArray(movieViews.site, ignoredSites),
          ),
        );
    }
    return {track: settings.track, ignoredSites};
  }

  async ignoreSite(userId: string, site: string): Promise<MovieSettings> {
    const settings = await this.settings(userId);
    return this.setSettings(userId, {
      ...settings,
      ignoredSites: [...settings.ignoredSites, site.toLowerCase()],
    });
  }

  async status(userId: string): Promise<MoviesStatus> {
    const [{unknown}] = await this.db
      .select({unknown: sql<number>`count(*)::int`})
      .from(movieViews)
      .where(
        and(
          eq(movieViews.userId, userId),
          eq(movieViews.kind, 'unknown'),
          eq(movieViews.dismissed, false),
          isNotNull(movieViews.resolvedAt),
        ),
      );
    return {
      tmdb: await this.secrets.has(userId, TMDB_KEY_SECRET),
      settings: await this.settings(userId),
      unknown,
    };
  }

  /**
   * The views from the extension: a new one is kept (its title is looked for by `movies.match`),
   * one sent again because it grew is brought up to date. The answer tells the extension whether
   * to go on watching and where not to.
   */
  async ingest(userId: string, views: WatchViewInput[]): Promise<WatchConfig> {
    const settings = await this.settings(userId);
    if (!settings.track) {
      return settings;
    }
    const ignored = new Set(settings.ignoredSites);
    const known = views.length
      ? await this.db
          .select({
            id: movieViews.id,
            kind: movieViews.kind,
            hints: movieViews.hints,
            titleId: movieViews.titleId,
          })
          .from(movieViews)
          .where(
            and(
              eq(movieViews.userId, userId),
              inArray(
                movieViews.id,
                views.map(view => view.id),
              ),
            ),
          )
      : [];
    const before = new Map(known.map(row => [row.id, row]));
    for (const view of views) {
      if (
        ignored.has(view.site) ||
        [...ignored].some(site => view.site.endsWith(`.${site}`))
      ) {
        continue;
      }
      const shortest = isVideoSite(view.site)
        ? MIN_VIDEO_SECONDS
        : MIN_FILM_SECONDS;
      if (view.durationSeconds !== null && view.durationSeconds < shortest) {
        continue;
      }
      const hints = JSON.stringify(view.hints);
      const name = view.hints.playerTitle || view.hints.pageTitle || view.site;
      const old = before.get(view.id);
      // A title not found, now with more to go by (Netflix shows its title a moment later):
      // looked for again.
      const retry = old?.kind === 'unknown' && old.hints !== hints;
      const grown = {
        endedAt: new Date(view.endedAt),
        watchedSeconds: view.watchedSeconds,
        positionSeconds: view.positionSeconds,
        durationSeconds: view.durationSeconds,
        ...(retry ? {hints, name, resolvedAt: null} : {}),
      };
      await this.db
        .insert(movieViews)
        .values({
          id: view.id,
          userId,
          kind: 'unknown',
          site: view.site,
          name,
          hints,
          startedAt: new Date(view.startedAt),
          ...grown,
        })
        .onConflictDoUpdate({
          target: movieViews.id,
          set: grown,
          // Another user's id is never touched.
          setWhere: eq(movieViews.userId, userId),
        });
    }
    // A film grown past most of its length is seen now.
    const titles = new Set(
      known.flatMap(row => (row.titleId ? [row.titleId] : [])),
    );
    for (const titleId of titles) {
      await this.markSeenIfWatched(userId, titleId);
    }
    return settings;
  }

  /** `history` — what was watched, newest first; `want` — the list to watch. */
  async titles(
    userId: string,
    list: 'history' | 'want',
  ): Promise<MovieTitle[]> {
    const t = movieTitles;
    const rows = await this.db
      .select()
      .from(t)
      .where(
        and(
          eq(t.userId, userId),
          list === 'want'
            ? isNotNull(t.wantedAt)
            : or(
                isNotNull(t.watchedOn),
                sql`exists (select 1 from ${movieViews} v where v.title_id = ${t.id} and not v.dismissed)`,
              ),
        ),
      )
      .orderBy(desc(list === 'want' ? t.wantedAt : t.updatedAt));
    const titles = await this.withViews(userId, rows);
    return list === 'want'
      ? titles
      : titles.sort((a, b) =>
          (b.lastWatchedAt ?? b.watchedOn ?? '').localeCompare(
            a.lastWatchedAt ?? a.watchedOn ?? '',
          ),
        );
  }

  async title(userId: string, id: string): Promise<MovieTitle> {
    const [row] = await this.db
      .select()
      .from(movieTitles)
      .where(and(eq(movieTitles.userId, userId), eq(movieTitles.id, id)));
    if (!row) {
      throw new NotFoundException();
    }
    const [title] = await this.withViews(userId, [row]);
    return title;
  }

  async views(userId: string, query: MovieViewsQuery): Promise<MovieView[]> {
    const {kind, limit} = movieViewsQuerySchema.parse(query);
    const v = movieViews;
    const rows = await this.db
      .select()
      .from(v)
      .where(
        and(
          eq(v.userId, userId),
          eq(v.dismissed, false),
          kind === 'all' ? undefined : eq(v.kind, kind),
          kind === 'unknown' ? isNotNull(v.resolvedAt) : undefined,
        ),
      )
      .orderBy(desc(v.startedAt))
      .limit(limit);
    return rows.map(toView);
  }

  async update(
    userId: string,
    id: string,
    patch: MovieTitleUpdate,
  ): Promise<MovieTitle> {
    const set: Partial<MovieTitleRow> = {updatedAt: new Date()};
    if (patch.rating !== undefined) {
      set.rating = patch.rating;
    }
    if (patch.note !== undefined) {
      set.note = patch.note || null;
    }
    if (patch.wanted !== undefined) {
      set.wantedAt = patch.wanted ? new Date() : null;
    }
    if (patch.watchedOn !== undefined) {
      set.watchedOn = patch.watchedOn;
      if (patch.watchedOn) {
        set.wantedAt = null;
      }
    }
    const [row] = await this.db
      .update(movieTitles)
      .set(set)
      .where(and(eq(movieTitles.userId, userId), eq(movieTitles.id, id)))
      .returning({id: movieTitles.id});
    if (!row) {
      throw new NotFoundException();
    }
    return this.title(userId, id);
  }

  /** The title goes; its views stay out of the lists as "not a film". */
  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .update(movieViews)
      .set({dismissed: true})
      .where(and(eq(movieViews.userId, userId), eq(movieViews.titleId, id)));
    await this.db
      .delete(movieTitles)
      .where(and(eq(movieTitles.userId, userId), eq(movieTitles.id, id)));
  }

  /** "Not a film": the view and the others of the same page title on that site. */
  async dismiss(userId: string, viewId: string): Promise<void> {
    const view = await this.view(userId, viewId);
    const same = await this.db
      .select({id: movieViews.id, name: movieViews.name})
      .from(movieViews)
      .where(
        and(
          eq(movieViews.userId, userId),
          eq(movieViews.site, view.site),
          eq(movieViews.kind, 'unknown'),
          eq(movieViews.dismissed, false),
        ),
      );
    const ids = same.filter(row => row.name === view.name).map(row => row.id);
    await this.db
      .update(movieViews)
      .set({dismissed: true})
      .where(
        and(
          eq(movieViews.userId, userId),
          inArray(movieViews.id, [view.id, ...ids]),
        ),
      );
  }

  async view(userId: string, id: string): Promise<MovieViewRow> {
    const [row] = await this.db
      .select()
      .from(movieViews)
      .where(and(eq(movieViews.userId, userId), eq(movieViews.id, id)));
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  /**
   * A film counts as seen once its views cover most of it: 60% of its length in TMDB, or of
   * the longest video when TMDB does not say. Then it leaves the list to watch.
   */
  async markSeenIfWatched(userId: string, titleId: string): Promise<void> {
    const [title] = await this.db
      .select()
      .from(movieTitles)
      .where(and(eq(movieTitles.userId, userId), eq(movieTitles.id, titleId)));
    if (!title || title.kind !== 'movie' || title.watchedOn) {
      return;
    }
    const [seen] = await this.db
      .select({
        seconds: sql<number>`coalesce(sum(${movieViews.watchedSeconds}), 0)::int`,
        longest: sql<number | null>`max(${movieViews.durationSeconds})`,
        lastAt: sql<Date | null>`max(${movieViews.endedAt})`,
      })
      .from(movieViews)
      .where(
        and(eq(movieViews.titleId, titleId), eq(movieViews.dismissed, false)),
      );
    const length = title.runtimeMinutes
      ? title.runtimeMinutes * 60
      : seen.longest;
    if (!length || !seen.lastAt || seen.seconds < length * 0.6) {
      return;
    }
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    await this.db
      .update(movieTitles)
      .set({
        watchedOn: zonedDateTime(new Date(seen.lastAt), timeZone).date,
        wantedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(movieTitles.id, titleId));
  }

  /** The titles with what their views tell: time, episodes, the last one. */
  private async withViews(
    userId: string,
    rows: MovieTitleRow[],
  ): Promise<MovieTitle[]> {
    if (!rows.length) {
      return [];
    }
    const v = movieViews;
    const stats = await this.db
      .select({
        titleId: v.titleId,
        seconds: sql<number>`coalesce(sum(${v.watchedSeconds}), 0)::int`,
        episodes: sql<number>`count(distinct (${v.season}, ${v.episode})) filter (where ${v.episode} is not null)::int`,
        lastAt: sql<string | null>`max(${v.endedAt})`,
        lastEpisode: sql<
          string | null
        >`max(lpad(coalesce(${v.season}, 0)::text, 3, '0') || ':' || lpad(${v.episode}::text, 4, '0')) filter (where ${v.episode} is not null)`,
      })
      .from(v)
      .where(
        and(
          eq(v.userId, userId),
          eq(v.dismissed, false),
          inArray(
            v.titleId,
            rows.map(row => row.id),
          ),
        ),
      )
      .groupBy(v.titleId);
    const byTitle = new Map(stats.map(row => [row.titleId, row]));
    return rows.map(row => {
      const seen = byTitle.get(row.id);
      const [season, episode] = seen?.lastEpisode?.split(':').map(Number) ?? [];
      return {
        id: row.id,
        tmdbId: row.tmdbId,
        kind: row.kind,
        title: row.title,
        originalTitle: row.originalTitle,
        year: row.year,
        posterUrl: posterUrl(row.posterPath),
        genres: row.genres,
        runtimeMinutes: row.runtimeMinutes,
        wantedAt: row.wantedAt?.toISOString() ?? null,
        watchedOn: row.watchedOn,
        rating: row.rating,
        note: row.note,
        watchedSeconds: seen?.seconds ?? 0,
        episodes: seen?.episodes ?? 0,
        lastWatchedAt: seen?.lastAt
          ? new Date(seen.lastAt).toISOString()
          : null,
        lastEpisode: episode ? {season, episode} : null,
      };
    });
  }

  /** The views still waiting for the server to look their title up. */
  unresolved(limit: number) {
    return this.db
      .select()
      .from(movieViews)
      .where(
        and(isNull(movieViews.resolvedAt), eq(movieViews.dismissed, false)),
      )
      .orderBy(movieViews.startedAt)
      .limit(limit);
  }
}

export function toView(row: MovieViewRow): MovieView {
  return {
    id: row.id,
    kind: row.kind,
    titleId: row.titleId,
    site: row.site,
    name: row.name,
    season: row.season,
    episode: row.episode,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt.toISOString(),
    watchedSeconds: row.watchedSeconds,
    positionSeconds: row.positionSeconds,
    durationSeconds: row.durationSeconds,
  };
}
