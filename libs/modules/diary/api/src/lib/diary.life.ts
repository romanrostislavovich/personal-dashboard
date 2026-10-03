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
                  detailKey: 'diary.life.moodDays',
                  detailParams: { days: moods.length },
                },
              ]
            : []),
        ];
      },
    });
  }
}

/** Plain text without the markdown marks; lines are joined with a dot so they do not run together. */
function excerpt(markdown: string): string {
  const text = markdown
    .split('\n')
    .map((line) => line.replace(/[#*_>`~=[\]()!-]+/g, ' ').trim())
    .filter(Boolean)
    .join(' · ')
    .replace(/\s+/g, ' ');
  return text.length > EXCERPT ? `${text.slice(0, EXCERPT)}…` : text;
}
