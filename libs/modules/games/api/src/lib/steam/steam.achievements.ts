import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  AchievementsService,
  achievementTiers,
  DB,
  Database,
} from '@pd/api-core';
import {and, eq, SQL, sql} from 'drizzle-orm';
import {gameAccounts, steamGames, steamPlayDays} from '../games.schema';

/** As many days as a game needs to be a number of Links of its own (games.links.ts). */
const FAVOURITE_DAYS = 10;

/**
 * Steam achievements: hours in the library, games played, favourite games (played on many days),
 * achievements unlocked in the games.
 */
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
      measure: userId =>
        this.total(userId, sql`coalesce(sum(${g.playtimeMinutes}) / 60, 0)`),
      tiers: achievementTiers(
        [
          100,
          '🎮',
          {en: 'Warm-up', ru: 'Разогрев'},
          {en: '100 hours in Steam games', ru: '100 часов в играх Steam'},
        ],
        [
          1000,
          '🕹️',
          {en: 'A thousand hours in game', ru: 'Тысяча часов в игре'},
          {en: '1,000 hours in Steam games', ru: '1 000 часов в играх Steam'},
        ],
        [
          5000,
          '🛋️',
          {en: 'Second home', ru: 'Второй дом'},
          {en: '5,000 hours in Steam games', ru: '5 000 часов в играх Steam'},
        ],
        [
          10_000,
          '🧙',
          {en: 'Ten thousand hours', ru: 'Десять тысяч часов'},
          {en: '10,000 hours in Steam games', ru: '10 000 часов в играх Steam'},
        ],
      ),
    });
    this.achievements.register({
      id: 'games.steam-favourites',
      module: 'games',
      measure: userId => this.favourites(userId),
      tiers: achievementTiers(
        [
          1,
          '❤️',
          {en: 'A favourite game', ru: 'Любимая игра'},
          {
            en: `A Steam game played on ${FAVOURITE_DAYS} different days`,
            ru: `Игра Steam, в которую играл ${FAVOURITE_DAYS} разных дней`,
          },
        ],
        [
          3,
          '🎮',
          {en: 'A rotation of favourites', ru: 'Любимая подборка'},
          {
            en: `3 Steam games played on ${FAVOURITE_DAYS} days each`,
            ru: `3 игры Steam, в каждую — ${FAVOURITE_DAYS} дней`,
          },
        ],
        [
          5,
          '🕹️',
          {en: 'A true collection', ru: 'Настоящая коллекция'},
          {
            en: `5 Steam games played on ${FAVOURITE_DAYS} days each`,
            ru: `5 игр Steam, в каждую — ${FAVOURITE_DAYS} дней`,
          },
        ],
      ),
    });
    this.achievements.register({
      id: 'games.steam-played',
      module: 'games',
      measure: userId =>
        this.total(
          userId,
          sql`count(*) FILTER (WHERE ${g.playtimeMinutes} > 0)`,
        ),
      tiers: achievementTiers(
        [
          10,
          '📀',
          {en: 'A shelf of games', ru: 'Полка с играми'},
          {en: '10 Steam games played', ru: '10 игр Steam, в которые ты играл'},
        ],
        [
          50,
          '🗄️',
          {en: 'Collection', ru: 'Коллекция'},
          {en: '50 Steam games played', ru: '50 игр Steam, в которые ты играл'},
        ],
        [
          200,
          '🏛️',
          {en: 'Museum of games', ru: 'Музей игр'},
          {
            en: '200 Steam games played',
            ru: '200 игр Steam, в которые ты играл',
          },
        ],
      ),
    });
    this.achievements.register({
      id: 'games.steam-achievements',
      module: 'games',
      measure: userId =>
        this.total(userId, sql`coalesce(sum(${g.achievementsUnlocked}), 0)`),
      tiers: achievementTiers(
        [
          100,
          '🏅',
          {en: 'Achiever', ru: 'Добытчик'},
          {
            en: '100 achievements in Steam games',
            ru: '100 достижений в играх Steam',
          },
        ],
        [
          500,
          '🏆',
          {en: 'Trophy room', ru: 'Зал трофеев'},
          {
            en: '500 achievements in Steam games',
            ru: '500 достижений в играх Steam',
          },
        ],
        [
          2000,
          '👑',
          {en: 'Trophy cabinet', ru: 'Полка трофеев'},
          {
            en: '2,000 achievements in Steam games',
            ru: '2 000 достижений в играх Steam',
          },
        ],
      ),
    });
  }

  /** An aggregate over the libraries of all Steam accounts of the user. */
  private async total(userId: string, aggregate: SQL): Promise<number> {
    const [row] = await this.db
      .select({value: sql<number>`(${aggregate})::int`})
      .from(steamGames)
      .innerJoin(gameAccounts, eq(gameAccounts.id, steamGames.accountId))
      .where(eq(gameAccounts.userId, userId));
    return row?.value ?? 0;
  }

  /** The games played on FAVOURITE_DAYS days or more: the ones Links follows by themselves. */
  private async favourites(userId: string): Promise<number> {
    const d = steamPlayDays;
    const rows = await this.db
      .select({appId: d.appId})
      .from(d)
      .where(and(eq(d.userId, userId), sql`${d.minutes} > 0`))
      .groupBy(d.appId)
      .having(sql`count(distinct ${d.day}) >= ${FAVOURITE_DAYS}`);
    return rows.length;
  }
}
