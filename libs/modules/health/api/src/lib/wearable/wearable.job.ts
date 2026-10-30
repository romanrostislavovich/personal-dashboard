import {Injectable, OnModuleInit} from '@nestjs/common';
import {forEachUser, SchedulerService} from '@pd/api-core';
import {WearableService} from './wearable.service';

/** Every hour: the band's new days from the Google Health API, for every user connected. */
@Injectable()
export class WearableJob implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly wearable: WearableService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'health.wearable-sync',
      cron: '7 * * * *',
      retry: true,
      handler: async () =>
        forEachUser(
          'health.wearable-sync',
          await this.wearable.connectedUserIds(),
          userId => this.wearable.sync(userId),
        ),
    });
  }
}
