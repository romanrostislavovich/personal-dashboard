import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LinksService, MOOD_METRIC } from '@pd/api-core';
import { DailyMetric } from '@pd/contracts';
import { and, eq, gte, lte } from 'drizzle-orm';
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
          .select({ day: diaryEntries.day, mood: diaryEntries.mood, words: diaryEntries.words })
          .from(diaryEntries)
          .where(
            and(
              eq(diaryEntries.userId, userId),
              gte(diaryEntries.day, from),
              lte(diaryEntries.day, to),
            ),
          );
        const metrics: DailyMetric[] = [
          {
            key: MOOD_METRIC,
            module: 'diary',
            labelKey: 'diary.links.mood',
            unit: 'score',
            days: days.flatMap(({ day, mood }) => (mood === null ? [] : [{ day, value: mood }])),
          },
          {
            key: 'diary.words',
            module: 'diary',
            labelKey: 'diary.links.words',
            unit: 'count',
            days: days
              .filter(({ words }) => words > 0)
              .map(({ day, words }) => ({ day, value: words })),
          },
        ];
        return metrics.filter((metric) => metric.days.length);
      },
    });

    this.links.registerPages([
      { module: 'diary', path: '/diary', description: 'the diary: entries, mood, photos' },
    ]);
  }
}
