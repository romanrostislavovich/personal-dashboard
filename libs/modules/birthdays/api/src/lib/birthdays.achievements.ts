import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { achievementTier, AchievementsService, DB, Database } from '@pd/api-core';
import { eq } from 'drizzle-orm';
import { birthdays } from './birthdays.schema';
import { BirthdaysService } from './birthdays.service';

/** Birthday achievements: how many people you won't forget to congratulate, and have a gift for. */
@Injectable()
export class BirthdaysAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
    private readonly people: BirthdaysService,
  ) {}

  onModuleInit(): void {
    // The gift ideas are the wishlist's: the core tells them by the name of the person.
    this.achievements.register({
      id: 'birthdays.gift-ideas',
      module: 'birthdays',
      measure: async (userId) =>
        (await this.people.list(userId)).filter((person) => person.giftIdeas.length > 0).length,
      tiers: [
        achievementTier(
          1,
          '🎁',
          { en: 'Thought ahead', ru: 'Подумал заранее' },
          {
            en: 'A gift idea for somebody: a wish of the wishlist marked as a gift for them',
            ru: 'Идея подарка для кого-то: желание из вишлиста, отмеченное как подарок для него',
          },
        ),
        achievementTier(
          5,
          '🎀',
          { en: 'Never empty-handed', ru: 'Не с пустыми руками' },
          { en: 'Gift ideas for five people', ru: 'Идеи подарков для пяти человек' },
        ),
      ],
    });

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
