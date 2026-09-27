import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerService } from '@pd/api-core';
import { LastfmService } from './lastfm.service';

/** Каждые 15 минут докачивает новые прослушивания из Last.fm. */
@Injectable()
export class LastfmSyncJob implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly lastfm: LastfmService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'music.lastfm-sync',
      cron: '*/15 * * * *',
      handler: async () => {
        for (const userId of await this.lastfm.connectedUserIds()) {
          await this.lastfm.sync(userId);
        }
      },
    });
  }
}
