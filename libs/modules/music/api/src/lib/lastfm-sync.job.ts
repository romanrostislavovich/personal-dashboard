import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerService } from '@pd/api-core';
import { LastfmHistoryImport } from './lastfm-history.import';
import { LastfmService } from './lastfm.service';

/**
 * Every 15 minutes: new plays from Last.fm, then a portion of the old history until all of it
 * is imported.
 */
@Injectable()
export class LastfmSyncJob implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly lastfm: LastfmService,
    private readonly history: LastfmHistoryImport,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'music.lastfm-sync',
      cron: '*/15 * * * *',
      handler: async () => {
        for (const userId of await this.lastfm.connectedUserIds()) {
          await this.lastfm.sync(userId);
          await this.history.continue(userId);
        }
      },
    });
  }
}
