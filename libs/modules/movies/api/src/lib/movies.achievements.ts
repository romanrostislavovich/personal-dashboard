import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  AchievementsService,
  achievementTiers,
  DB,
  Database,
} from '@pd/api-core';
import {sql} from 'drizzle-orm';
import {movieTitles} from './movies.schema';

/**
 * Movies achievements: films and shows seen (the extension marks them, or the user does), the
 * ones rated, and how wide the taste is. The hours in players are Activity's ("Popcorn").
 */
@Injectable()
export class MoviesAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'movies.films',
      module: 'movies',
      measure: userId => this.count(userId, sql`kind = 'movie'`),
      tiers: achievementTiers(
        [
          1,
          '🎬',
          {en: 'Lights down', ru: 'Свет гаснет'},
          {en: 'The first film seen', ru: 'Первый просмотренный фильм'},
        ],
        [
          25,
          '🎟️',
          {en: 'Season ticket', ru: 'Абонемент'},
          {en: '25 films seen', ru: '25 просмотренных фильмов'},
        ],
        [
          100,
          '📽️',
          {en: 'Film buff', ru: 'Синефил'},
          {en: '100 films seen', ru: '100 просмотренных фильмов'},
        ],
        [
          500,
          '🏛️',
          {en: 'Cinematheque', ru: 'Синематека'},
          {en: '500 films seen', ru: '500 просмотренных фильмов'},
        ],
      ),
    });

    this.achievements.register({
      id: 'movies.shows',
      module: 'movies',
      measure: userId => this.count(userId, sql`kind = 'tv'`),
      tiers: achievementTiers(
        [
          1,
          '📺',
          {en: 'Next episode', ru: 'Следующая серия'},
          {en: 'The first show seen', ru: 'Первый просмотренный сериал'},
        ],
        [
          10,
          '🛋️',
          {en: 'Binge watcher', ru: 'Запойный зритель'},
          {en: '10 shows seen', ru: '10 просмотренных сериалов'},
        ],
      ),
    });

    this.achievements.register({
      id: 'movies.rated',
      module: 'movies',
      measure: userId => this.count(userId, sql`rating IS NOT NULL`),
      tiers: achievementTiers(
        [
          10,
          '⭐',
          {en: 'Critic', ru: 'Критик'},
          {
            en: '10 films or shows rated',
            ru: '10 оценённых фильмов и сериалов',
          },
        ],
        [
          50,
          '🎞️',
          {en: 'Film critic', ru: 'Кинокритик'},
          {
            en: '50 films or shows rated',
            ru: '50 оценённых фильмов и сериалов',
          },
        ],
      ),
    });

    this.achievements.register({
      id: 'movies.genres',
      module: 'movies',
      measure: userId => this.genres(userId),
      tiers: achievementTiers(
        [
          5,
          '🎭',
          {en: 'Every taste', ru: 'На любой вкус'},
          {en: 'Films of 5 genres seen', ru: 'Просмотрены фильмы 5 жанров'},
        ],
        [
          12,
          '🌍',
          {en: 'The whole catalogue', ru: 'Весь каталог'},
          {en: 'Films of 12 genres seen', ru: 'Просмотрены фильмы 12 жанров'},
        ],
      ),
    });
  }

  /** The titles seen that match `where`. */
  private async count(
    userId: string,
    where: ReturnType<typeof sql>,
  ): Promise<number> {
    const {rows} = await this.db.execute<{value: number}>(sql`
      SELECT count(*)::int AS value FROM ${movieTitles}
      WHERE user_id = ${userId} AND watched_on IS NOT NULL AND (${where})
    `);
    return rows[0]?.value ?? 0;
  }

  /** The genres (TMDB's) of the titles seen. */
  private async genres(userId: string): Promise<number> {
    const {rows} = await this.db.execute<{value: number}>(sql`
      SELECT count(DISTINCT genre)::int AS value
      FROM ${movieTitles}, unnest(genres) AS genre
      WHERE user_id = ${userId} AND watched_on IS NOT NULL
    `);
    return rows[0]?.value ?? 0;
  }
}
