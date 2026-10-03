import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LifeService, localDaysRange, UsersService } from '@pd/api-core';
import { LifeCard, LifeEvent } from '@pd/contracts';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { dotaMatches, gameAccounts } from './games.schema';

/** Dota 2 matches of a day and of a period, with the wins. */
@Injectable()
export class GamesLife implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly life: LifeService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.life.register({
      module: 'games',
      day: async (userId, day): Promise<LifeEvent[]> => {
        const { matches, wins } = await this.dota(userId, { from: day, to: day });
        return matches
          ? [
              {
                module: 'games',
                icon: 'sports_esports',
                key: 'games.life.dotaDay',
                params: { matches, wins },
                at: null,
                link: '/games',
              },
            ]
          : [];
      },
      period: async (userId, period): Promise<LifeCard[]> => {
        const { matches, wins } = await this.dota(userId, period);
        return matches
          ? [
              {
                module: 'games',
                icon: 'sports_esports',
                key: 'games.life.dotaMatches',
                value: matches,
                format: 'number',
                detailKey: 'games.life.dotaWins',
                detailParams: { wins, rate: Math.round((wins / matches) * 100) },
              },
            ]
          : [];
      },
    });
  }

  private async dota(userId: string, period: { from: string; to: string }) {
    const { start, end } = localDaysRange(
      this.users.timeZoneOf(await this.users.findById(userId)),
      period,
    );
    const [row] = await this.db
      .select({
        matches: sql<number>`count(*)::int`,
        wins: sql<number>`count(*) filter (where ${dotaMatches.won})::int`,
      })
      .from(dotaMatches)
      .innerJoin(gameAccounts, eq(gameAccounts.id, dotaMatches.accountId))
      .where(
        and(
          eq(gameAccounts.userId, userId),
          gte(dotaMatches.startedAt, start),
          lt(dotaMatches.startedAt, end),
        ),
      );
    return { matches: row?.matches ?? 0, wins: row?.wins ?? 0 };
  }
}
