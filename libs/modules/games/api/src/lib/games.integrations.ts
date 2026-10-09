import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, IntegrationsService } from '@pd/api-core';
import { eq } from 'drizzle-orm';
import { gameAccounts } from './games.schema';

/** The accounts are asked every half an hour. */
const STALE_HOURS = 12;
const NAMES = { steam: 'Steam', dota2: 'Dota 2', wow: 'World of Warcraft' } as const;

/** The connections of Games in the list of integrations: every game account. */
@Injectable()
export class GamesIntegrations implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly integrations: IntegrationsService,
  ) {}

  onModuleInit(): void {
    this.integrations.register({
      id: 'games.account',
      module: 'games',
      staleHours: STALE_HOURS,
      reports: async (userId) => {
        const accounts = await this.db
          .select()
          .from(gameAccounts)
          .where(eq(gameAccounts.userId, userId));
        return accounts.map((account) => ({
          key: account.id,
          name: NAMES[account.game],
          detail: account.displayName,
          lastSyncedAt: account.lastSyncedAt,
          error: account.lastError,
        }));
      },
    });
  }
}
