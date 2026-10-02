import { Injectable, OnModuleInit } from '@nestjs/common';
import { AchievementsService, achievementTiers, AchievementTierTuple } from '@pd/api-core';
import { ActivityCategory } from '@pd/contracts';
import { ActivityService } from './activity.service';

const HOUR = 3600;

/** Achievements of the Activity section: hours recorded in total and on what. */
@Injectable()
export class ActivityAchievements implements OnModuleInit {
  constructor(
    private readonly achievements: AchievementsService,
    private readonly activity: ActivityService,
  ) {}

  onModuleInit(): void {
    this.hours('activity.hours', null, [
      [
        10,
        '🖥️',
        { en: 'On the record', ru: 'Под запись' },
        { en: '10 hours at the computer recorded', ru: 'Записано 10 часов за компьютером' },
      ],
      [
        100,
        '⌨️',
        { en: 'A hundred hours', ru: 'Сотня часов' },
        { en: '100 hours at the computer', ru: '100 часов за компьютером' },
      ],
      [
        1000,
        '🕰️',
        { en: 'A thousand hours', ru: 'Тысяча часов' },
        { en: '1,000 hours at the computer', ru: '1 000 часов за компьютером' },
      ],
    ]);
    this.hours('activity.development-hours', 'development', [
      [
        50,
        '👨‍💻',
        { en: 'In the editor', ru: 'В редакторе' },
        { en: '50 hours in development tools', ru: '50 часов в инструментах разработки' },
      ],
      [
        500,
        '🧑‍🔬',
        { en: 'Deep work', ru: 'Глубокая работа' },
        { en: '500 hours in development tools', ru: '500 часов в инструментах разработки' },
      ],
    ]);
    this.hours('activity.games-hours', 'games', [
      [
        100,
        '🎮',
        { en: 'Player', ru: 'Игрок' },
        { en: '100 hours in games', ru: '100 часов в играх' },
      ],
    ]);
  }

  /** Whole hours recorded: in total (`null`) or in one category. */
  private hours(
    id: string,
    category: ActivityCategory | null,
    tiers: AchievementTierTuple[],
  ): void {
    this.achievements.register({
      id,
      module: 'activity',
      measure: async (userId) => {
        const lifetime = await this.activity.lifetime(userId);
        const seconds = category ? (lifetime.byCategory.get(category) ?? 0) : lifetime.total;
        return Math.floor(seconds / HOUR);
      },
      tiers: achievementTiers(...tiers),
    });
  }
}
