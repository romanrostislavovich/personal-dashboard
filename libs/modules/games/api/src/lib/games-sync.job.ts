import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerService } from '@pd/api-core';
import { GameAccountsService } from './game-accounts.service';

/** Раз в час обновляет игровые аккаунты: новые матчи Dota, ачивки WoW. */
@Injectable()
export class GamesSyncJob implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly accounts: GameAccountsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'games.sync',
      cron: '20 * * * *',
      handler: () => this.accounts.syncAll(),
    });
  }
}
