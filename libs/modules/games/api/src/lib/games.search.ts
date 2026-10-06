import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { contains, DB, Database, SEARCH_LIMIT, SearchService } from '@pd/api-core';
import { SearchHit } from '@pd/contracts';
import { and, desc, eq, or } from 'drizzle-orm';
import { gameAccounts, steamGames } from './games.schema';

/** Game accounts and the Steam library for the command palette: by the name. */
@Injectable()
export class GamesSearch implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly search: SearchService,
  ) {}

  onModuleInit(): void {
    this.search.register({ module: 'games', search: (userId, query) => this.find(userId, query) });
  }

  private async find(userId: string, query: string): Promise<SearchHit[]> {
    const accounts = await this.db
      .select()
      .from(gameAccounts)
      .where(
        and(
          eq(gameAccounts.userId, userId),
          or(contains(gameAccounts.displayName, query), contains(gameAccounts.externalId, query)),
        ),
      )
      .limit(SEARCH_LIMIT);
    const library = await this.db
      .select({ name: steamGames.name, minutes: steamGames.playtimeMinutes })
      .from(steamGames)
      .innerJoin(gameAccounts, eq(gameAccounts.id, steamGames.accountId))
      .where(and(eq(gameAccounts.userId, userId), contains(steamGames.name, query)))
      .orderBy(desc(steamGames.playtimeMinutes))
      .limit(SEARCH_LIMIT);
    return [
      ...accounts.map((row) => ({
        module: 'games',
        kind: 'account',
        title: row.displayName,
        subtitle: row.game,
        url: '/games',
      })),
      ...library.map((row) => ({
        module: 'games',
        kind: 'game',
        title: row.name,
        subtitle: `${Math.round(row.minutes / 60)} h`,
        url: '/games',
      })),
    ];
  }
}
