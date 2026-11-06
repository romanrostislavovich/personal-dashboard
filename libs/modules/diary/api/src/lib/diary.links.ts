import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {DB, Database, LinksService, MOOD_METRIC} from '@pd/api-core';
import {DailyMetric} from '@pd/contracts';
import {moodVolatility, shift, tagDays} from './diary-metrics';
import {and, eq, gte, lte} from 'drizzle-orm';
import {diaryEntries} from './diary.schema';

/** The mood's spread is of the last two weeks. */
const VOLATILITY_DAYS = 14;

/**
 * What the diary tells the other sections (see LinksService): the mood of every day — what the
 * numbers of the other sections are compared against ("what goes with a good day") — its spread,
 * the words, and the most used tags as yes/no days ("#sport" against the mood).
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
      metrics: async (userId, {from, to}) => {
        // The spread of the mood looks back two weeks: those days are read too.
        const before = await this.db
          .select({
            day: diaryEntries.day,
            mood: diaryEntries.mood,
            energy: diaryEntries.energy,
            anxiety: diaryEntries.anxiety,
            words: diaryEntries.words,
            tags: diaryEntries.tags,
          })
          .from(diaryEntries)
          .where(
            and(
              eq(diaryEntries.userId, userId),
              gte(diaryEntries.day, shift(from, -VOLATILITY_DAYS)),
              lte(diaryEntries.day, to),
            ),
          );
        const days = before.filter(({day}) => day >= from);
        const metrics: DailyMetric[] = [
          {
            key: MOOD_METRIC,
            module: 'diary',
            labelKey: 'diary.links.mood',
            unit: 'score',
            outcome: true,
            days: days.flatMap(({day, mood}) =>
              mood === null ? [] : [{day, value: mood}],
            ),
          },
          // The evening check-in: what a day gives, like the mood.
          ...(['energy', 'anxiety'] as const).map((feeling): DailyMetric => ({
            key: `diary.${feeling}`,
            module: 'diary',
            labelKey: `diary.links.${feeling}`,
            unit: 'score',
            outcome: true,
            days: days.flatMap(day =>
              day[feeling] === null
                ? []
                : [{day: day.day, value: day[feeling] as number}],
            ),
          })),
          {
            key: 'diary.words',
            module: 'diary',
            labelKey: 'diary.links.words',
            unit: 'count',
            days: days
              .filter(({words}) => words > 0)
              .map(({day, words}) => ({day, value: words})),
          },
          {
            key: 'diary.moodSpread',
            module: 'diary',
            labelKey: 'diary.links.moodSpread',
            unit: 'score',
            parts: [MOOD_METRIC],
            days: moodVolatility(before, VOLATILITY_DAYS).filter(
              ({day}) => day >= from,
            ),
          },
          ...tagDays(days).map((tag): DailyMetric => ({
            key: `diary.tag.${tag.tag}`,
            module: 'diary',
            labelKey: 'diary.links.tag',
            label: `#${tag.tag}`,
            unit: 'count',
            // A day without an entry says nothing about the tag.
            missing: 'absent',
            days: tag.days,
          })),
        ];
        return metrics.filter(metric => metric.days.length);
      },
    });

    this.links.registerPages([
      {
        module: 'diary',
        path: '/diary',
        description: 'the diary: entries, mood, photos',
      },
    ]);
  }
}
