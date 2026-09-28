import { Injectable, OnModuleInit } from '@nestjs/common';
import { ServerActions } from '@pd/api-core';
import { gameAccountInputSchema } from '@pd/contracts';
import { z } from 'zod';
import { GameAccountsService } from './game-accounts.service';

/** OpenDota and Battle.net requests run on the server (see ServerActions). */
export const GAMES_ACTIONS = {
  addAccount: 'games.add-account',
  syncAccount: 'games.sync-account',
} as const;

const idArgs = z.object({ id: z.uuid() });

@Injectable()
export class GamesServerActions implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly accounts: GameAccountsService,
  ) {}

  onModuleInit(): void {
    this.actions.register(GAMES_ACTIONS.addAccount, (userId, args) =>
      this.accounts.add(userId, gameAccountInputSchema.parse(args)),
    );
    this.actions.register(GAMES_ACTIONS.syncAccount, (userId, args) =>
      this.accounts.syncOne(userId, idArgs.parse(args).id),
    );
  }
}
