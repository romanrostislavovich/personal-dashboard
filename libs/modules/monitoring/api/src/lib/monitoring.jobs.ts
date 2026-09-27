import { Injectable, OnModuleInit } from '@nestjs/common';
import { NotificationsService, SchedulerService, UsersService } from '@pd/api-core';
import { CheckerService } from './checker.service';
import { monitoringMessages } from './monitoring.messages';
import { isSslReminderDay } from './state/monitor-state';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Две фоновые задачи:
 * - каждые 5 минут — проверка доступности и алерты «упал/поднялся»;
 * - раз в день — сроки SSL-сертификатов и чистка старой истории.
 */
@Injectable()
export class MonitoringJobs implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly users: UsersService,
    private readonly checker: CheckerService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'monitoring.uptime',
      cron: '*/5 * * * *',
      handler: () => this.checkUptime(),
    });
    this.scheduler.register({
      name: 'monitoring.daily',
      cron: '10 9 * * *',
      handler: () => this.daily(),
    });
  }

  async checkUptime(): Promise<void> {
    for (const notice of await this.checker.checkAll()) {
      const text = monitoringMessages(await this.localeOf(notice.userId));
      const { event } = notice;
      await this.notifications.send(notice.userId, {
        title: event.type === 'down' ? text.downTitle(notice) : text.recoveredTitle(notice),
        body:
          event.type === 'down'
            ? text.downBody(notice)
            : text.recoveredBody(notice, event.downtimeMs),
        source: 'monitoring',
      });
    }
  }

  async daily(): Promise<void> {
    await this.checker.deleteOldResults();
    for (const notice of await this.checker.refreshSsl()) {
      const daysLeft = Math.floor((notice.expiresAt.getTime() - Date.now()) / DAY_MS);
      if (!isSslReminderDay(daysLeft)) {
        continue;
      }
      const text = monitoringMessages(await this.localeOf(notice.userId));
      await this.notifications.send(notice.userId, {
        title: text.sslTitle(notice),
        body: text.sslBody(notice, daysLeft),
        source: 'monitoring',
      });
    }
  }

  private async localeOf(userId: string): Promise<string> {
    return (await this.users.findById(userId))?.locale ?? 'en';
  }
}
