import { Injectable, OnModuleInit } from '@nestjs/common';
import { achievementTier, AchievementsService } from '@pd/api-core';
import { LastfmService } from './lastfm.service';

/** Ачивки музыки: скробблы в Last.fm за всё время и рекорд прослушиваний за день. */
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
        achievementTier(1_000, '🎧', 'Меломан', '1 000 прослушиваний в Last.fm'),
        achievementTier(10_000, '🎶', 'Десять тысяч треков', '10 000 прослушиваний в Last.fm'),
        achievementTier(50_000, '💿', 'Коллекционер', '50 000 прослушиваний в Last.fm'),
        achievementTier(100_000, '🏆', 'Сто тысяч', '100 000 прослушиваний в Last.fm'),
      ],
    });

    this.achievements.register({
      id: 'music.plays-in-day',
      module: 'music',
      measure: (userId) => this.lastfm.maxPlaysInDay(userId),
      tiers: [
        achievementTier(50, '🎵', 'Музыкальный день', '50 треков за один день'),
        achievementTier(100, '🔊', 'Марафон', '100 треков за один день'),
      ],
    });
  }
}
