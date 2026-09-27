import { Injectable, OnModuleInit } from '@nestjs/common';
import { achievementTier, AchievementsService } from '@pd/api-core';
import { LastfmService } from './lastfm.service';

/** Music achievements: all-time Last.fm scrobbles and the record number of plays in a day. */
@Injectable()
export class MusicAchievements implements OnModuleInit {
  constructor(
    private readonly achievements: AchievementsService,
    private readonly lastfm: LastfmService,
  ) {}

  onModuleInit(): void {
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
}
