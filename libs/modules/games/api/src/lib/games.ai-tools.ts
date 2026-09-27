import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS } from '@pd/api-core';
import { GameAccountsService } from './game-accounts.service';

/** AI access to games: Dota 2 and WoW. */
@Injectable()
export class GamesAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly accounts: GameAccountsService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'games_accounts',
      module: 'games',
      description:
        'Game accounts. Dota 2: medal (rankTier = medal×10+stars, 8 = Immortal), wins/losses ' +
        'over 30 days, recent matches with heroes and KDA, favourite heroes. WoW: character, ilvl, ' +
        'achievement points and recent achievements.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.accounts.list(userId),
    });
  }
}
