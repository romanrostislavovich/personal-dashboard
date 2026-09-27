import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { achievementTier, AchievementsService, DB, Database } from '@pd/api-core';
import { and, asc, eq, sql } from 'drizzle-orm';
import { longestWinStreak } from './dota/win-streak';
import { dotaMatches, gameAccounts } from './games.schema';

/** Ачивки игр: победы и серии в Dota 2, медаль, очки достижений в WoW. */
@Injectable()
export class GamesAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'games.dota-wins',
      module: 'games',
      measure: (userId) => this.dotaWins(userId),
      tiers: [
        achievementTier(
          10,
          '⚔️',
          { en: 'First blood', ru: 'Первая кровь' },
          {
            en: '10 wins in Dota 2 (saved matches)',
            ru: '10 побед в Dota 2 (по сохранённым матчам)',
          },
        ),
        achievementTier(
          100,
          '🗡️',
          { en: 'Veteran', ru: 'Ветеран' },
          { en: '100 wins in Dota 2', ru: '100 побед в Dota 2' },
        ),
        achievementTier(
          500,
          '🐉',
          { en: 'Arena legend', ru: 'Легенда арены' },
          { en: '500 wins in Dota 2', ru: '500 побед в Dota 2' },
        ),
      ],
    });

    this.achievements.register({
      id: 'games.dota-win-streak',
      module: 'games',
      measure: (userId) => this.dotaWinStreak(userId),
      tiers: [
        achievementTier(
          5,
          '🔥',
          { en: 'Streak', ru: 'Серия' },
          { en: '5 wins in a row in Dota 2', ru: '5 побед подряд в Dota 2' },
        ),
        achievementTier(
          10,
          '☄️',
          { en: 'Unstoppable', ru: 'Неудержимый' },
          { en: '10 wins in a row in Dota 2', ru: '10 побед подряд в Dota 2' },
        ),
      ],
    });

    this.achievements.register({
      id: 'games.dota-medal',
      module: 'games',
      // rank_tier = медаль × 10 + звёзды; берём медаль лучшего аккаунта.
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
  }

  private async dotaWins(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ wins: sql<number>`count(*)::int` })
      .from(dotaMatches)
      .innerJoin(gameAccounts, eq(gameAccounts.id, dotaMatches.accountId))
      .where(and(eq(gameAccounts.userId, userId), eq(dotaMatches.won, true)));
    return row?.wins ?? 0;
  }

  /** Лучшая серия среди всех Dota-аккаунтов пользователя. */
  private async dotaWinStreak(userId: string): Promise<number> {
    const rows = await this.db
      .select({ accountId: dotaMatches.accountId, won: dotaMatches.won })
      .from(dotaMatches)
      .innerJoin(gameAccounts, eq(gameAccounts.id, dotaMatches.accountId))
      .where(eq(gameAccounts.userId, userId))
      .orderBy(asc(dotaMatches.startedAt));
    const resultsByAccount = new Map<string, boolean[]>();
    for (const row of rows) {
      const results = resultsByAccount.get(row.accountId) ?? [];
      results.push(row.won);
      resultsByAccount.set(row.accountId, results);
    }
    return Math.max(0, ...[...resultsByAccount.values()].map(longestWinStreak));
  }

  /** Максимум числового поля профиля среди аккаунтов игры (профиль хранится в jsonb). */
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
