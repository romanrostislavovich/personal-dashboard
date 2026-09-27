import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerService } from '@pd/api-core';
import { CostSourcesService } from './cost-sources.service';

/**
 * Updates costs from connected services once a day.
 * At 07:00 — before recurring payments (08:00) and morning reminders (09:00).
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
