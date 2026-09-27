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
        achievementTier(
          3,
          '🌱',
          { en: 'Off to a start', ru: 'Начало положено' },
          { en: '3 days in a row with a diary entry', ru: '3 дня подряд с записью в дневнике' },
        ),
        achievementTier(
          7,
          '🔥',
          { en: 'A week in a row', ru: 'Неделя подряд' },
          { en: '7 days in a row with a diary entry', ru: '7 дней подряд с записью в дневнике' },
        ),
        achievementTier(
          30,
          '📅',
          { en: 'A month in a row', ru: 'Месяц подряд' },
          { en: '30 days in a row with a diary entry', ru: '30 дней подряд с записью в дневнике' },
        ),
        achievementTier(
          100,
          '💯',
          { en: 'Hundred', ru: 'Сотня' },
          {
            en: '100 days in a row with a diary entry',
            ru: '100 дней подряд с записью в дневнике',
          },
        ),
        achievementTier(
          365,
          '🏛️',
          { en: 'A year without gaps', ru: 'Год без пропусков' },
          {
            en: '365 days in a row with a diary entry',
            ru: '365 дней подряд с записью в дневнике',
          },
        ),
      ],
    });

    this.achievements.register({
      id: 'diary.entries',
      module: 'diary',
      measure: async (userId) => (await this.diary.stats(userId)).totalEntries,
      tiers: [
        achievementTier(
          10,
          '✍️',
          { en: 'First pages', ru: 'Первые страницы' },
          { en: '10 diary entries', ru: '10 записей в дневнике' },
        ),
        achievementTier(
          50,
          '📖',
          { en: 'Chronicler', ru: 'Летописец' },
          { en: '50 diary entries', ru: '50 записей в дневнике' },
        ),
        achievementTier(
          100,
          '📚',
          { en: 'Volume one', ru: 'Том первый' },
          { en: '100 diary entries', ru: '100 записей в дневнике' },
        ),
        achievementTier(
          365,
          '🗂️',
          { en: 'A year on paper', ru: 'Год жизни на бумаге' },
          { en: '365 diary entries', ru: '365 записей в дневнике' },
        ),
      ],
    });
  }
}
