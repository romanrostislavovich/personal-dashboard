import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { DiaryService } from './diary.service';

/** The diary streak in the morning digest: when it breaks, starts again or completes a week. */
@Injectable()
export class DiaryDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly diary: DiaryService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'diary.streak',
      module: 'diary',
      description:
        'Diary streak: `streakWeeks` — full weeks of writing every day (0 — less than a week), ' +
        '`streakAlive` — whether the streak goes on. Congratulate on a new week, or say the ' +
        'streak was broken and invite to write today.',
      // Whole weeks, not days: a streak that grows by one every morning is not news.
      collect: async (userId) => {
        const { currentStreak, totalEntries } = await this.diary.stats(userId);
        if (totalEntries === 0) {
          return null;
        }
        return { streakAlive: currentStreak > 0, streakWeeks: Math.floor(currentStreak / 7) };
      },
    });
  }
}
