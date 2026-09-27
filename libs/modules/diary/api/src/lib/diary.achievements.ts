import { Injectable, OnModuleInit } from '@nestjs/common';
import { achievementTier, AchievementsService } from '@pd/api-core';
import { DiaryService } from './diary.service';

/** Ачивки дневника: рекордная серия дней подряд и количество записей. */
@Injectable()
export class DiaryAchievements implements OnModuleInit {
  constructor(
    private readonly achievements: AchievementsService,
    private readonly diary: DiaryService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'diary.longest-streak',
      module: 'diary',
      measure: async (userId) => (await this.diary.stats(userId)).longestStreak,
      tiers: [
        achievementTier(3, '🌱', 'Начало положено', '3 дня подряд с записью в дневнике'),
        achievementTier(7, '🔥', 'Неделя подряд', '7 дней подряд с записью в дневнике'),
        achievementTier(30, '📅', 'Месяц подряд', '30 дней подряд с записью в дневнике'),
        achievementTier(100, '💯', 'Сотня', '100 дней подряд с записью в дневнике'),
        achievementTier(365, '🏛️', 'Год без пропусков', '365 дней подряд с записью в дневнике'),
      ],
    });

    this.achievements.register({
      id: 'diary.entries',
      module: 'diary',
      measure: async (userId) => (await this.diary.stats(userId)).totalEntries,
      tiers: [
        achievementTier(10, '✍️', 'Первые страницы', '10 записей в дневнике'),
        achievementTier(50, '📖', 'Летописец', '50 записей в дневнике'),
        achievementTier(100, '📚', 'Том первый', '100 записей в дневнике'),
        achievementTier(365, '🗂️', 'Год жизни на бумаге', '365 записей в дневнике'),
      ],
    });
  }
}
