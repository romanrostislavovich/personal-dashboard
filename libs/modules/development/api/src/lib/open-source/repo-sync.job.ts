import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NotificationsService, SchedulerService, UsersService } from '@pd/api-core';
import { openSourceMessages, hasNews } from './open-source.messages';
import { ReposService } from './repos.service';

/**
 * Hourly: re-reads the account's public repositories, updates the statistics of all of them
 * and sends the news of those with notifications on — new issues/PRs, releases, star milestones.
 */
@Injectable()
export class RepoSyncJob implements OnModuleInit {
  private readonly logger = new Logger(RepoSyncJob.name);

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly users: UsersService,
    private readonly repos: ReposService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'development.repo-sync',
      cron: '0 * * * *',
      handler: () => this.run(),
    });
  }

  async run(): Promise<void> {
    for (const user of await this.users.findAll()) {
      // One user's revoked token must not stop the others.
      const news = await this.repos.syncAll(user.id).then(
        (events) => events.filter(hasNews),
        (error) => {
          this.logger.warn(`Repository sync for ${user.id} failed: ${error}`);
          return [];
        },
      );
      if (news.length === 0) {
        continue;
      }
      const text = openSourceMessages(user.locale);
      await this.notifications.send(user.id, {
        title: text.title,
        body: text.body(news),
        source: 'development',
      });
    }
  }
}
