import {Injectable, OnModuleInit} from '@nestjs/common';
import {forEachUser, SchedulerService} from '@pd/api-core';
import {WakatimeService} from './wakatime.service';

/**
 * Copies the latest days from WakaTime every hour. WakaTime keeps only a short history on the
 * free plan, so a day not copied in time is lost — the job re-reads the last week.
 */
@Injectable()
export class WakatimeJob implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly wakatime: WakatimeService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'development.wakatime-sync',
      cron: '40 * * * *',
      // It only copies days, and a day not copied in time is lost: worth another try.
      retry: true,
      handler: async () =>
        forEachUser(
          'development.wakatime-sync',
          await this.wakatime.connectedUserIds(),
          userId => this.wakatime.sync(userId),
        ),
    });
  }
}
