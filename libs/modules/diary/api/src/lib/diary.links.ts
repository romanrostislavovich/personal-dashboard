import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LinksService, MOOD_METRIC } from '@pd/api-core';
import { and, eq, gte, isNotNull, lte } from 'drizzle-orm';
import { diaryEntries } from './diary.schema';

/**
 * What the diary tells the other sections (see LinksService): the mood of every day — what the
 * numbers of the other sections are compared against ("what goes with a good day").
 */
@Injectable()
export class DiaryLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
  ) {}

  onModuleInit(): void {
    this.links.registerDailyMetrics({
      module: 'diary',
      metrics: async (userId, { from, to }) => {
        const days = await this.db
          .select({ day: diaryEntries.day, mood: diaryEntries.mood })
          .from(diaryEntries)
          .where(
            and(
              eq(diaryEntries.userId, userId),
              isNotNull(diaryEntries.mood),
              gte(diaryEntries.day, from),
              lte(diaryEntries.day, to),
            ),
          );
        return [
          {
            key: MOOD_METRIC,
            module: 'diary',
            labelKey: 'diary.links.mood',
            unit: 'score',
            days: days.map(({ day, mood }) => ({ day, value: mood ?? 0 })),
          },
        ];
      },
    });

    this.links.registerPages([
      { module: 'diary', path: '/diary', description: 'the diary: entries, mood, photos' },
    ]);
  }
}
