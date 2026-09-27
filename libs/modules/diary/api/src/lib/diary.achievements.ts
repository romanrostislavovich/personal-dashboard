import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { eq, SQL, sql } from 'drizzle-orm';
import { achievementTier, achievementTiers, AchievementsService, DB, Database } from '@pd/api-core';
import { diaryEntries } from './diary.schema';
import { DiaryPhotosService } from './diary-photos.service';
import { DiaryService } from './diary.service';

/** Diary achievements: the longest streak of days in a row and the number of entries. */
@Injectable()
export class DiaryAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
    private readonly diary: DiaryService,
    private readonly photos: DiaryPhotosService,
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

    this.achievements.register({
      id: 'diary.great-days',
      module: 'diary',
      measure: (userId) =>
        this.aggregate(userId, sql`count(*) FILTER (WHERE ${diaryEntries.mood} = 5)`),
      tiers: achievementTiers(
        [
          10,
          '😄',
          { en: 'Good days', ru: 'Хорошие дни' },
          { en: '10 days rated 5 out of 5', ru: '10 дней с оценкой 5 из 5' },
        ],
        [
          50,
          '🌞',
          { en: 'Sunny side', ru: 'Солнечная сторона' },
          { en: '50 days rated 5 out of 5', ru: '50 дней с оценкой 5 из 5' },
        ],
      ),
    });
    this.achievements.register({
      id: 'diary.tags',
      module: 'diary',
      measure: (userId) => this.distinctTags(userId),
      tiers: achievementTiers(
        [
          10,
          '🏷️',
          { en: 'Organizer', ru: 'Систематизатор' },
          { en: '10 different tags', ru: '10 разных тегов' },
        ],
        [
          50,
          '🗃️',
          { en: 'Archivist', ru: 'Архивариус' },
          { en: '50 different tags', ru: '50 разных тегов' },
        ],
      ),
    });
    this.achievements.register({
      id: 'diary.words',
      module: 'diary',
      measure: (userId) =>
        this.aggregate(
          userId,
          sql`coalesce(sum(array_length(regexp_split_to_array(trim(${diaryEntries.content}), '\\s+'), 1)), 0)`,
        ),
      tiers: achievementTiers(
        [
          10_000,
          '✍️',
          { en: 'Writer', ru: 'Писатель' },
          { en: '10,000 words in the diary', ru: '10 000 слов в дневнике' },
        ],
        [
          100_000,
          '📖',
          { en: 'Novelist', ru: 'Романист' },
          { en: '100,000 words in the diary', ru: '100 000 слов в дневнике' },
        ],
      ),
    });

    this.achievements.register({
      id: 'diary.marks',
      module: 'diary',
      measure: (userId) =>
        this.aggregate(userId, sql`coalesce(sum(jsonb_array_length(${diaryEntries.marks})), 0)`),
      tiers: achievementTiers(
        [
          10,
          '🖍️',
          { en: 'Highlighter', ru: 'Маркер' },
          { en: '10 marked fragments', ru: '10 отмеченных фрагментов' },
        ],
        [
          100,
          '🌈',
          { en: 'Colourful memories', ru: 'Яркие воспоминания' },
          { en: '100 marked fragments', ru: '100 отмеченных фрагментов' },
        ],
      ),
    });

    this.achievements.register({
      id: 'diary.photos',
      module: 'diary',
      measure: (userId) => this.photos.count(userId),
      tiers: achievementTiers(
        [
          10,
          '📷',
          { en: 'Photo album', ru: 'Фотоальбом' },
          { en: '10 photos in the diary', ru: '10 фото в дневнике' },
        ],
        [
          100,
          '🎞️',
          { en: 'Photo chronicle', ru: 'Фотолетопись' },
          { en: '100 photos in the diary', ru: '100 фото в дневнике' },
        ],
      ),
    });
  }

  private async distinctTags(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`count(DISTINCT tag)::int` })
      .from(sql`${diaryEntries}, unnest(${diaryEntries.tags}) AS tag`)
      .where(eq(diaryEntries.userId, userId));
    return row?.value ?? 0;
  }

  private async aggregate(userId: string, expression: SQL): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`(${expression})::int` })
      .from(diaryEntries)
      .where(eq(diaryEntries.userId, userId));
    return row?.value ?? 0;
  }
}
