import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { achievementTier, AchievementsService, DB, Database } from '@pd/api-core';
import { and, eq, sql } from 'drizzle-orm';
import { gameAccounts } from './games.schema';
import { wowDetails } from './wow/wow.schema';

/** Account-based game achievements: Dota 2 medal and WoW achievement points (match-based Dota ones are in DotaAchievements). */
@Injectable()
export class GamesAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'games.dota-medal',
      module: 'games',
      // rank_tier = medal × 10 + stars; take the medal of the best account.
      measure: async (userId) =>
        Math.floor((await this.maxProfileNumber(userId, 'dota2', 'rankTier')) / 10),
      tiers: [
        achievementTier(
          5,
          '🎖️',
          { en: 'Legend', ru: 'Легенда' },
          { en: 'Legend medal in Dota 2', ru: 'Медаль «Легенда» в Dota 2' },
        ),
        achievementTier(
          6,
          '🏅',
          { en: 'Ancient', ru: 'Властелин' },
          { en: 'Ancient medal in Dota 2', ru: 'Медаль «Властелин» в Dota 2' },
        ),
        achievementTier(
          7,
          '💎',
          { en: 'Divine', ru: 'Божество' },
          { en: 'Divine medal in Dota 2', ru: 'Медаль «Божество» в Dota 2' },
        ),
        achievementTier(
          8,
          '👑',
          { en: 'Immortal', ru: 'Титан' },
          { en: 'Immortal medal in Dota 2', ru: 'Медаль «Титан» в Dota 2' },
        ),
      ],
    });

    this.achievements.register({
      id: 'games.wow-points',
      module: 'games',
      measure: (userId) => this.maxProfileNumber(userId, 'wow', 'achievementPoints'),
      tiers: [
        achievementTier(
          5_000,
          '🏆',
          { en: 'Achievement hunter', ru: 'Охотник за достижениями' },
          { en: '5,000 achievement points in WoW', ru: '5 000 очков достижений в WoW' },
        ),
        achievementTier(
          10_000,
          '🥇',
          { en: 'Collector of Azeroth', ru: 'Коллекционер Азерота' },
          { en: '10,000 achievement points in WoW', ru: '10 000 очков достижений в WoW' },
        ),
        achievementTier(
          20_000,
          '🌍',
          { en: 'Conqueror of Azeroth', ru: 'Покоритель Азерота' },
          { en: '20,000 achievement points in WoW', ru: '20 000 очков достижений в WoW' },
        ),
      ],
    });

    this.achievements.register({
      id: 'games.wow-mythic',
      module: 'games',
      measure: (userId) => this.maxWowDetail(userId, ['mythic', 'rating']),
      tiers: [
        achievementTier(
          1000,
          '🗝️',
          { en: 'Keystone runner', ru: 'Бегун по ключам' },
          { en: 'Mythic+ rating 1,000 in WoW', ru: 'Рейтинг Mythic+ 1 000 в WoW' },
        ),
        achievementTier(
          2000,
          '⏱️',
          { en: 'Keystone master', ru: 'Мастер ключей' },
          { en: 'Mythic+ rating 2,000', ru: 'Рейтинг Mythic+ 2 000' },
        ),
        achievementTier(
          3000,
          '🌠',
          { en: 'Keystone legend', ru: 'Легенда ключей' },
          { en: 'Mythic+ rating 3,000', ru: 'Рейтинг Mythic+ 3 000' },
        ),
      ],
    });

    this.achievements.register({
      id: 'games.wow-mounts',
      module: 'games',
      measure: (userId) => this.maxWowDetail(userId, ['collections', 'mounts']),
      tiers: [
        achievementTier(
          50,
          '🐎',
          { en: 'Stable keeper', ru: 'Хозяин конюшни' },
          { en: '50 mounts in WoW', ru: '50 средств передвижения в WoW' },
        ),
        achievementTier(
          200,
          '🦄',
          { en: 'Mount collector', ru: 'Коллекционер транспорта' },
          { en: '200 mounts', ru: '200 средств передвижения' },
        ),
        achievementTier(
          500,
          '🐉',
          { en: 'Lord of the reins', ru: 'Повелитель поводьев' },
          { en: '500 mounts', ru: '500 средств передвижения' },
        ),
      ],
    });
  }

  /** The best value of a number kept in the details of the user's WoW characters. */
  private async maxWowDetail(userId: string, path: string[]): Promise<number> {
    const [row] = await this.db
      .select({
        value: sql<
          number | null
        >`max((${wowDetails.details} #>> ${`{${path.join(',')}}`})::numeric)::int`,
      })
      .from(wowDetails)
      .innerJoin(gameAccounts, eq(gameAccounts.id, wowDetails.accountId))
      .where(eq(gameAccounts.userId, userId));
    return row?.value ?? 0;
  }

  /** Maximum of a numeric profile field across the game's accounts (the profile is stored in jsonb). */
  private async maxProfileNumber(
    userId: string,
    game: 'dota2' | 'wow',
    field: string,
  ): Promise<number> {
    const [row] = await this.db
      .select({
        value: sql<number | null>`max((${gameAccounts.profile} ->> ${field})::numeric)::int`,
      })
      .from(gameAccounts)
      .where(and(eq(gameAccounts.userId, userId), eq(gameAccounts.game, game)));
    return row?.value ?? 0;
  }
}
