import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { achievementTier, AchievementsService, DB, Database } from '@pd/api-core';
import { eq } from 'drizzle-orm';
import { birthdays } from './birthdays.schema';

/** Birthday achievements: how many people you won't forget to congratulate. */
@Injectable()
export class BirthdaysAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'birthdays.saved',
      module: 'birthdays',
      measure: (userId) => this.db.$count(birthdays, eq(birthdays.userId, userId)),
      tiers: [
        achievementTier(
          5,
          '🎂',
          { en: 'Won’t forget', ru: 'Не забуду' },
          { en: '5 birthdays saved', ru: '5 дней рождения в списке' },
        ),
        achievementTier(
          20,
          '🎉',
          { en: 'Life of the party', ru: 'Душа компании' },
          { en: '20 birthdays saved', ru: '20 дней рождения в списке' },
        ),
        achievementTier(
          50,
          '🏡',
          { en: 'Big family', ru: 'Большая семья' },
          { en: '50 birthdays saved', ru: '50 дней рождения в списке' },
        ),
      ],
    });
  }
}
