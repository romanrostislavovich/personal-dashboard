import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AchievementsService, achievementTiers, DB, Database } from '@pd/api-core';
import { eq, SQL, sql } from 'drizzle-orm';
import { gameAccounts, steamGames } from '../games.schema';

/** Steam achievements: hours in the library, games played, achievements unlocked in the games. */
@Injectable()
export class SteamAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    const g = steamGames;
    this.achievements.register({
      id: 'games.steam-hours',
      module: 'games',
      measure: (userId) => this.total(userId, sql`coalesce(sum(${g.playtimeMinutes}) / 60, 0)`),
      tiers: achievementTiers(
        [
          100,
          '🎮',
          { en: 'Warmed up', ru: 'Разогрев' },
          { en: '100 hours in Steam games', ru: '100 часов в играх Steam' },
        ],
        [
          1000,
          '🕹️',
          { en: 'A thousand hours', ru: 'Тысяча часов' },
          { en: '1,000 hours in Steam games', ru: '1 000 часов в играх Steam' },
        ],
        [
          5000,
          '🛋️',
          { en: 'Second home', ru: 'Второй дом' },
          { en: '5,000 hours in Steam games', ru: '5 000 часов в играх Steam' },
        ],
        [
          10_000,
          '🧙',
          { en: 'Ten thousand hours', ru: 'Десять тысяч часов' },
          { en: '10,000 hours in Steam games', ru: '10 000 часов в играх Steam' },
        ],
      ),
    });
    this.achievements.register({
      id: 'games.steam-played',
      module: 'games',
      measure: (userId) =>
        this.total(userId, sql`count(*) FILTER (WHERE ${g.playtimeMinutes} > 0)`),
      tiers: achievementTiers(
        [
          10,
          '📀',
          { en: 'A shelf of games', ru: 'Полка с играми' },
          { en: '10 Steam games played', ru: '10 игр Steam, в которые ты играл' },
        ],
        [
          50,
          '🗄️',
          { en: 'Collection', ru: 'Коллекция' },
          { en: '50 Steam games played', ru: '50 игр Steam, в которые ты играл' },
        ],
        [
          200,
          '🏛️',
          { en: 'Museum of games', ru: 'Музей игр' },
          { en: '200 Steam games played', ru: '200 игр Steam, в которые ты играл' },
        ],
      ),
    });
    this.achievements.register({
      id: 'games.steam-achievements',
      module: 'games',
      measure: (userId) => this.total(userId, sql`coalesce(sum(${g.achievementsUnlocked}), 0)`),
      tiers: achievementTiers(
        [
          100,
          '🏅',
          { en: 'Achiever', ru: 'Добытчик' },
          { en: '100 achievements in Steam games', ru: '100 достижений в играх Steam' },
        ],
        [
          500,
          '🏆',
          { en: 'Trophy room', ru: 'Зал трофеев' },
          { en: '500 achievements in Steam games', ru: '500 достижений в играх Steam' },
        ],
        [
          2000,
          '👑',
          { en: 'Completionist', ru: 'Перфекционист' },
          { en: '2,000 achievements in Steam games', ru: '2 000 достижений в играх Steam' },
        ],
      ),
    });
  }

  /** An aggregate over the libraries of all Steam accounts of the user. */
  private async total(userId: string, aggregate: SQL): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`(${aggregate})::int` })
      .from(steamGames)
      .innerJoin(gameAccounts, eq(gameAccounts.id, steamGames.accountId))
      .where(eq(gameAccounts.userId, userId));
    return row?.value ?? 0;
  }
}
