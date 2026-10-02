import { Injectable, OnModuleInit } from '@nestjs/common';
import { AchievementsService, achievementTiers, AchievementTierTuple } from '@pd/api-core';
import { SoundcloudStats } from '@pd/contracts';
import { SoundcloudService } from './soundcloud.service';

/** Achievements of an author on SoundCloud: plays, tracks, followers, likes. */
@Injectable()
export class SoundcloudAchievements implements OnModuleInit {
  constructor(
    private readonly achievements: AchievementsService,
    private readonly soundcloud: SoundcloudService,
  ) {}

  onModuleInit(): void {
    this.metric('music.soundcloud-plays', (stats) => stats.totals.plays, [
      [
        100,
        '☁️',
        { en: 'First listeners', ru: 'Первые слушатели' },
        { en: '100 plays of your tracks on SoundCloud', ru: '100 прослушиваний твоих треков' },
      ],
      [
        1000,
        '📻',
        { en: 'On air', ru: 'В эфире' },
        { en: '1,000 plays of your tracks', ru: '1 000 прослушиваний твоих треков' },
      ],
      [
        10_000,
        '🎚️',
        { en: 'Ten thousand plays', ru: 'Десять тысяч прослушиваний' },
        { en: '10,000 plays of your tracks', ru: '10 000 прослушиваний твоих треков' },
      ],
      [
        100_000,
        '🏟️',
        { en: 'A full stadium', ru: 'Полный стадион' },
        { en: '100,000 plays of your tracks', ru: '100 000 прослушиваний твоих треков' },
      ],
    ]);
    this.metric('music.soundcloud-tracks', (stats) => stats.tracks.length, [
      [
        1,
        '🎙️',
        { en: 'Debut', ru: 'Дебют' },
        { en: 'A track published on SoundCloud', ru: 'Опубликован трек на SoundCloud' },
      ],
      [
        10,
        '💽',
        { en: 'Discography', ru: 'Дискография' },
        { en: '10 tracks on SoundCloud', ru: '10 треков на SoundCloud' },
      ],
      [
        50,
        '🗄️',
        { en: 'An archive of mixes', ru: 'Архив миксов' },
        { en: '50 tracks on SoundCloud', ru: '50 треков на SoundCloud' },
      ],
    ]);
    this.metric('music.soundcloud-followers', (stats) => stats.followers, [
      [
        10,
        '👂',
        { en: 'Somebody listens', ru: 'Кто-то слушает' },
        { en: '10 followers on SoundCloud', ru: '10 подписчиков на SoundCloud' },
      ],
      [
        100,
        '📣',
        { en: 'An audience', ru: 'Своя аудитория' },
        { en: '100 followers on SoundCloud', ru: '100 подписчиков на SoundCloud' },
      ],
      [
        1000,
        '🌐',
        { en: 'Known by name', ru: 'Знают по имени' },
        { en: '1,000 followers on SoundCloud', ru: '1 000 подписчиков на SoundCloud' },
      ],
    ]);
    this.metric('music.soundcloud-likes', (stats) => stats.totals.likes, [
      [
        50,
        '🧡',
        { en: 'Liked', ru: 'Нравится' },
        { en: '50 likes on your tracks', ru: '50 лайков на твоих треках' },
      ],
      [
        500,
        '💛',
        { en: 'Loved', ru: 'Любят' },
        { en: '500 likes on your tracks', ru: '500 лайков на твоих треках' },
      ],
    ]);
  }

  private metric(
    id: string,
    value: (stats: SoundcloudStats) => number,
    tiers: AchievementTierTuple[],
  ): void {
    this.achievements.register({
      id,
      module: 'music',
      measure: async (userId) => {
        const stats = await this.soundcloud.stats(userId);
        return stats ? value(stats) : 0;
      },
      tiers: achievementTiers(...tiers),
    });
  }
}
