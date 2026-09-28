import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AchievementsService, SchedulerService } from '@pd/api-core';
import { LastfmHistoryImport } from './lastfm-history.import';
import { LastfmService } from './lastfm.service';

/**
 * Every 15 minutes: new plays from Last.fm, then a portion of the old history until all of it
 * is imported. When plays were added, achievements are checked right away — music goes on all day,
 * the hourly check would lag behind.
 */
@Injectable()
export class LastfmSyncJob implements OnModuleInit {
  private readonly logger = new Logger(LastfmSyncJob.name);

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly lastfm: LastfmService,
    private readonly history: LastfmHistoryImport,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'music.lastfm-sync',
      cron: '*/15 * * * *',
      handler: async () => {
        for (const userId of await this.lastfm.connectedUserIds()) {
          await this.syncUser(userId);
        }
      },
    });
  }

  private async syncUser(userId: string): Promise<void> {
    const before = await this.lastfm.storedCount(userId);
    await this.lastfm.sync(userId);
    await this.history.continue(userId);
    if ((await this.lastfm.storedCount(userId)) > before) {
      await this.achievements
        .evaluate(userId)
        .catch((error) => this.logger.warn(`Achievements check for ${userId} failed: ${error}`));
    }
  }
}
