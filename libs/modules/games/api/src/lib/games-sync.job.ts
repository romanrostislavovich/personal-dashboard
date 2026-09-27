import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerService } from '@pd/api-core';
import { GameAccountsService } from './game-accounts.service';

/** Updates game accounts hourly: new Dota matches, WoW achievements. */
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
