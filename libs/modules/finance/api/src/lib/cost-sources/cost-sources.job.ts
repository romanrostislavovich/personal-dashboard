import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerService } from '@pd/api-core';
import { CostSourcesService } from './cost-sources.service';

/**
 * Раз в день обновляет затраты из подключённых сервисов.
 * В 07:00 — до регулярных платежей (08:00) и утренних напоминаний (09:00).
 */
@Injectable()
export class CostSourcesJob implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly costSources: CostSourcesService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'finance.cost-sources',
      cron: '0 7 * * *',
      handler: () => this.costSources.syncAll(),
    });
  }
}
