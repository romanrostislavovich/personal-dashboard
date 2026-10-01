import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ServerActions } from '@pd/api-core';
import { gameAccountInputSchema, openDotaKeyInputSchema } from '@pd/contracts';
import { z } from 'zod';
import { OpenDotaKeyService } from './dota/opendota-key.service';
import { GameAccountsService } from './game-accounts.service';

/** OpenDota and Battle.net requests run on the server (see ServerActions). */
export const GAMES_ACTIONS = {
  addAccount: 'games.add-account',
  syncAccount: 'games.sync-account',
  syncAll: 'games.sync-all',
  saveOpenDotaKey: 'games.save-opendota-key',
} as const;

const idArgs = z.object({ id: z.uuid() });
const keyArgs = openDotaKeyInputSchema.extend({ accountId: z.uuid() });

@Injectable()
export class GamesServerActions implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly accounts: GameAccountsService,
    private readonly openDotaKeys: OpenDotaKeyService,
  ) {}

  onModuleInit(): void {
    this.actions.register(GAMES_ACTIONS.addAccount, (userId, args) =>
      this.accounts.add(userId, gameAccountInputSchema.parse(args)),
    );
    this.actions.register(GAMES_ACTIONS.syncAccount, (userId, args) =>
      this.accounts.syncOne(userId, idArgs.parse(args).id),
    );
    this.actions.register(GAMES_ACTIONS.syncAll, (userId) => this.accounts.syncAllOf(userId));
    // The key is checked against OpenDota, and its account is re-read with it right away.
    this.actions.register(GAMES_ACTIONS.saveOpenDotaKey, async (userId, args) => {
      const { accountId, apiKey } = keyArgs.parse(args);
      // 404 for somebody else's account before anything is saved.
      if (!(await this.accounts.idsOf(userId, 'dota2')).includes(accountId)) {
        throw new NotFoundException();
      }
      await this.openDotaKeys.save(userId, accountId, apiKey);
      await this.accounts.syncOne(userId, accountId);
    });
  }
}
