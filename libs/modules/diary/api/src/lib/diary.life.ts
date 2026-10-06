import { Injectable, OnModuleInit } from '@nestjs/common';
import { LifeService } from '@pd/api-core';
import { LifeCard, LifeEvent } from '@pd/contracts';
import { DiaryService } from './diary.service';

/** An excerpt of the day's entry is enough for the timeline. */
const EXCERPT = 160;

/** The diary in the life timeline (the day's entry) and in the summaries (entries, words, mood). */
@Injectable()
export class DiaryLife implements OnModuleInit {
  constructor(
    private readonly life: LifeService,
    private readonly diary: DiaryService,
  ) {}

  onModuleInit(): void {
    this.life.register({
      module: 'diary',
      day: async (userId, day): Promise<LifeEvent[]> => {
        const entry = await this.diary.get(userId, day);
        if (!entry?.content.trim() && !entry?.mood) {
          return [];
        }
        return [
          {
            module: 'diary',
            icon: 'menu_book',
            key: entry.mood ? 'diary.life.entryMood' : 'diary.life.entry',
            params: { excerpt: excerpt(entry.content), mood: entry.mood ?? 0 },
            at: null,
            link: `/diary?day=${day}`,
          },
        ];
      },
      period: async (userId, period): Promise<LifeCard[]> => {
        const entries = await this.diary.list(userId, period);
        if (!entries.length) {
          return [];
        }
        const words = entries.reduce(
          (sum, e) => sum + e.content.split(/\s+/).filter(Boolean).length,
          0,
        );
        const moods = entries.map((e) => e.mood).filter((mood): mood is number => mood !== null);
        return [
          {
            module: 'diary',
            icon: 'menu_book',
            key: 'diary.life.entries',
            value: entries.length,
            format: 'number',
            detailKey: 'diary.life.words',
            detailParams: { words },
          },
          ...(moods.length
            ? [
                {
                  module: 'diary',
                  icon: 'mood',
                  key: 'diary.life.mood',
                  value: Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10,
                  format: 'number' as const,
                  aggregate: 'average' as const,
                  detailKey: 'diary.life.moodDays',
                  detailParams: { days: moods.length },
                },
              ]
            : []),
          ...bestMonth(entries),
        ];
      },
    });
  }
}

/** Plain text without the markdown marks; lines are joined with a dot so they do not run together. */
/** At least this many rated days make a month worth comparing. */
const BEST_MONTH_DAYS = 5;

/** The month with the best average mood, when the period spans several months. */
function bestMonth(entries: { day: string; mood: number | null }[]): LifeCard[] {
  const months = new Map<string, number[]>();
  for (const entry of entries) {
    if (entry.mood !== null) {
      const month = entry.day.slice(0, 7);
      months.set(month, [...(months.get(month) ?? []), entry.mood]);
    }
  }
  const ranked = [...months]
    .filter(([, moods]) => moods.length >= BEST_MONTH_DAYS)
    .map(([month, moods]) => ({ month, mood: moods.reduce((a, b) => a + b, 0) / moods.length }))
    .sort((a, b) => b.mood - a.mood);
  if (ranked.length < 2) {
    return [];
  }
  const [year, number] = ranked[0].month.split('-');
  return [
    {
      module: 'diary',
      icon: 'sentiment_very_satisfied',
      key: 'diary.life.bestMonth',
      value: Math.round(ranked[0].mood * 10) / 10,
      format: 'number',
      aggregate: 'average',
      detailKey: `diary.life.months.${Number(number)}`,
      detailParams: { year },
    },
  ];
}

function excerpt(markdown: string): string {
  const text = markdown
    .split('\n')
    .map((line) => line.replace(/[#*_>`~=[\]()!-]+/g, ' ').trim())
    .filter(Boolean)
    .join(' · ')
    .replace(/\s+/g, ' ');
  return text.length > EXCERPT ? `${text.slice(0, EXCERPT)}…` : text;
}
