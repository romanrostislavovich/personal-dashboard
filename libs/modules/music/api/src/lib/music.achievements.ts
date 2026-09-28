import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { eq, SQL, sql } from 'drizzle-orm';
import { achievementTier, achievementTiers, AchievementsService, DB, Database } from '@pd/api-core';
import { LastfmService } from './lastfm.service';
import { scrobbles } from './music.schema';

/** Music achievements: all-time Last.fm scrobbles and the record number of plays in a day. */
@Injectable()
export class MusicAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
    private readonly lastfm: LastfmService,
  ) {}

  onModuleInit(): void {
    this.registerVolume();
    this.registerVarietyAndHabit();
  }

  /** How much is played: in total and in one day. */
  private registerVolume(): void {
    this.achievements.register({
      id: 'music.scrobbles',
      module: 'music',
      measure: async (userId) => (await this.lastfm.totalScrobbles(userId)) ?? 0,
      tiers: [
        achievementTier(
          1_000,
          '🎧',
          { en: 'Music lover', ru: 'Меломан' },
          { en: '1,000 scrobbles on Last.fm', ru: '1 000 прослушиваний в Last.fm' },
        ),
        achievementTier(
          10_000,
          '🎶',
          { en: 'Ten thousand tracks', ru: 'Десять тысяч треков' },
          { en: '10,000 scrobbles on Last.fm', ru: '10 000 прослушиваний в Last.fm' },
        ),
        achievementTier(
          50_000,
          '💿',
          { en: 'Collector', ru: 'Коллекционер' },
          { en: '50,000 scrobbles on Last.fm', ru: '50 000 прослушиваний в Last.fm' },
        ),
        achievementTier(
          100_000,
          '🏆',
          { en: 'A hundred thousand', ru: 'Сто тысяч' },
          { en: '100,000 scrobbles on Last.fm', ru: '100 000 прослушиваний в Last.fm' },
        ),
      ],
    });

    this.achievements.register({
      id: 'music.plays-in-day',
      module: 'music',
      measure: (userId) => this.lastfm.maxPlaysInDay(userId),
      tiers: [
        achievementTier(
          50,
          '🎵',
          { en: 'Music day', ru: 'Музыкальный день' },
          { en: '50 tracks in a single day', ru: '50 треков за один день' },
        ),
        achievementTier(
          100,
          '🔊',
          { en: 'Marathon', ru: 'Марафон' },
          { en: '100 tracks in a single day', ru: '100 треков за один день' },
        ),
      ],
    });
  }

  /** Different artists and days with music. */
  private registerVarietyAndHabit(): void {
    this.achievements.register({
      id: 'music.artists',
      module: 'music',
      measure: (userId) => this.distinct(userId, sql`count(DISTINCT ${scrobbles.artist})`),
      tiers: achievementTiers(
        [
          100,
          '🎤',
          { en: 'Explorer', ru: 'Исследователь' },
          { en: '100 different artists', ru: '100 разных исполнителей' },
        ],
        [
          500,
          '🗺️',
          { en: 'Globetrotter', ru: 'Путешественник' },
          { en: '500 different artists', ru: '500 разных исполнителей' },
        ],
        [
          2000,
          '🌌',
          { en: 'Music universe', ru: 'Музыкальная вселенная' },
          { en: '2,000 different artists', ru: '2 000 разных исполнителей' },
        ],
      ),
    });
    this.achievements.register({
      id: 'music.listening-days',
      module: 'music',
      measure: (userId) =>
        this.distinct(userId, sql`count(DISTINCT date_trunc('day', ${scrobbles.playedAt}))`),
      tiers: achievementTiers(
        [
          30,
          '📅',
          { en: 'Daily soundtrack', ru: 'Саундтрек каждого дня' },
          { en: 'Music on 30 different days', ru: 'Музыка в 30 разных дней' },
        ],
        [
          365,
          '🎧',
          { en: 'Year of music', ru: 'Год с музыкой' },
          { en: 'Music on 365 different days', ru: 'Музыка в 365 разных дней' },
        ],
      ),
    });
  }

  /** Counts over the local play history (only what has been synced from Last.fm). */
  private async distinct(userId: string, expression: SQL): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`(${expression})::int` })
      .from(scrobbles)
      .where(eq(scrobbles.userId, userId));
    return row?.value ?? 0;
  }
}
