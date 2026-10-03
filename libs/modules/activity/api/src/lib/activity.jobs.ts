import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerService } from '@pd/api-core';
import { WellbeingService } from './wellbeing.service';

/** Background work of the Activity section: the health of the computers is kept for a month. */
@Injectable()
export class ActivityJobs implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly wellbeing: WellbeingService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'activity.health-cleanup',
      cron: '40 4 * * *',
      handler: () => this.wellbeing.deleteOldHealth(),
    });
  }
}
