import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {DB, Database, IntegrationsService} from '@pd/api-core';
import {eq} from 'drizzle-orm';
import {gameAccounts} from './games.schema';
import {SteamKeyService} from './steam/steam-key.service';
import {WowService} from './wow/wow.service';
import {XboxService} from './xbox/xbox.service';

/** The accounts are asked every half an hour. */
const STALE_HOURS = 12;
const NAMES = {
  steam: 'Steam',
  dota2: 'Dota 2',
  wow: 'World of Warcraft',
  xbox: 'Xbox',
} as const;

/**
 * The connections of Games in the list of integrations: every game account, and the keys the
 * accounts are read with (Steam Web API, Battle.net).
 */
@Injectable()
export class GamesIntegrations implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly integrations: IntegrationsService,
    private readonly steamKeys: SteamKeyService,
    private readonly wow: WowService,
    private readonly xbox: XboxService,
  ) {}

  onModuleInit(): void {
    this.integrations.register({
      id: 'games.account',
      module: 'games',
      name: 'Steam / Dota 2 / World of Warcraft / Xbox',
      staleHours: STALE_HOURS,
      reports: async userId => {
        const accounts = await this.db
          .select()
          .from(gameAccounts)
          .where(eq(gameAccounts.userId, userId));
        return accounts.map(account => ({
          key: account.id,
          name: NAMES[account.game],
          detail: account.displayName,
          lastSyncedAt: account.lastSyncedAt,
          error: account.lastError,
        }));
      },
    });
    this.integrations.register({
      id: 'games.steam-key',
      module: 'games',
      name: 'Steam Web API',
      reports: async userId =>
        (await this.steamKeys.has(userId)) ? [{name: 'Steam Web API'}] : [],
    });
    this.integrations.register({
      id: 'games.xbox-key',
      module: 'games',
      name: 'Xbox (OpenXBL)',
      reports: async userId =>
        (await this.xbox.hasKey(userId)) ? [{name: 'Xbox (OpenXBL)'}] : [],
    });
    this.integrations.register({
      id: 'games.battle-net',
      module: 'games',
      name: 'Battle.net',
      reports: async userId =>
        (await this.wow.hasCredentials(userId)) ? [{name: 'Battle.net'}] : [],
    });
  }
}
