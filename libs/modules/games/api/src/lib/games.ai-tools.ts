import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS } from '@pd/api-core';
import { GameAccountsService } from './game-accounts.service';

/** Доступ AI к играм: Dota 2 и WoW. */
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
        'Игровые аккаунты. Dota 2: медаль (rankTier = медаль×10+звёзды, 8 = Титан), победы/поражения ' +
        'за 30 дней, последние матчи с героями и KDA, любимые герои. WoW: персонаж, ilvl, ' +
        'очки и последние достижения.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.accounts.list(userId),
    });
  }
}
