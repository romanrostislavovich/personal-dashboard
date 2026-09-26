import { Injectable, OnModuleInit } from '@nestjs/common';
import { NotificationsService, SchedulerService, UsersService } from '@pd/api-core';
import { githubOssMessages, hasNews } from '../github-oss.messages';
import { ReposService } from '../repos.service';

/**
 * Каждый час обновляет статистику репозиториев и присылает новости:
 * новые issues/PR, релизы, круглые отметки по звёздам.
 */
@Injectable()
export class GithubSyncJob implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly users: UsersService,
    private readonly repos: ReposService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'github-oss.sync',
      cron: '0 * * * *',
      handler: () => this.run(),
    });
  }

  async run(): Promise<void> {
    for (const user of await this.users.findAll()) {
      const news = (await this.repos.syncAll(user.id)).filter(hasNews);
      if (news.length === 0) {
        continue;
      }
      const text = githubOssMessages(user.locale);
      await this.notifications.send(user.id, {
        title: text.title,
        body: text.body(news),
        source: 'github-oss',
      });
    }
  }
}
