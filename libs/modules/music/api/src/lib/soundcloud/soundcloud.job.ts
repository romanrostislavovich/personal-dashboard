import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NotificationsService, SchedulerService, UsersService } from '@pd/api-core';
import { hasNews, soundcloudMessages } from './soundcloud.messages';
import { SoundcloudService } from './soundcloud.service';

/**
 * Hourly: re-reads the SoundCloud profile and its tracks, saves the counters of the day and
 * tells the news — play milestones, new comments, new followers.
 */
@Injectable()
export class SoundcloudJob implements OnModuleInit {
  private readonly logger = new Logger(SoundcloudJob.name);

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly users: UsersService,
    private readonly soundcloud: SoundcloudService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'music.soundcloud-sync',
      cron: '25 * * * *',
      handler: () => this.run(),
    });
  }

  private async run(): Promise<void> {
    for (const userId of await this.soundcloud.connectedUserIds()) {
      // One user's expired token must not stop the others; the error is saved for the page.
      const news = await this.soundcloud.sync(userId).catch((error) => {
        this.logger.warn(`SoundCloud sync for ${userId} failed: ${error}`);
        return null;
      });
      const user = news && hasNews(news) ? await this.users.findById(userId) : null;
      if (!news || !user) {
        continue;
      }
      const text = soundcloudMessages(user.locale);
      await this.notifications.send(userId, {
        title: text.title,
        body: text.body(news),
        source: 'music',
      });
    }
  }
}
