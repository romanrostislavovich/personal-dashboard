import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  AutomationsService,
  NotificationsService,
  SchedulerService,
  UsersService,
} from '@pd/api-core';
import { ProjectChange } from '@pd/contracts';
import { CheckerService, MonitorNotice } from './checker.service';
import { MonitoringLinks } from './monitoring.links';
import { monitoringMessages } from './monitoring.messages';
import { isSslReminderDay } from './state/monitor-state';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Two background jobs:
 * - every 5 minutes — availability check and "down/up" alerts;
 * - once a day — SSL certificate expiry and cleanup of old history.
 */
@Injectable()
export class MonitoringJobs implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly users: UsersService,
    private readonly checker: CheckerService,
    private readonly notifications: NotificationsService,
    private readonly automations: AutomationsService,
    private readonly links: MonitoringLinks,
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
      // A site that went down right after a commit or a release: the alert names it.
      const [change] = event.type === 'down' ? await this.changesBefore(notice, event.since) : [];
      await this.notifications.send(notice.userId, {
        title: event.type === 'down' ? text.downTitle(notice) : text.recoveredTitle(notice),
        body:
          event.type === 'down'
            ? text.downBody(notice) +
              (change ? `\n${text.lastChange(change, event.since.getTime())}` : '')
            : text.recoveredBody(notice, event.downtimeMs),
        source: 'monitoring',
      });
      await this.automations.emit(
        notice.userId,
        event.type === 'down' ? 'monitoring.down' : 'monitoring.up',
        { site: notice.projectName, url: notice.url, error: notice.error ?? '' },
      );
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

  /** Never fails the alert: a code hosting that does not answer only leaves the line out. */
  private async changesBefore(notice: MonitorNotice, since: Date): Promise<ProjectChange[]> {
    try {
      return await this.links.changesBefore(notice.userId, notice.projectId, since);
    } catch {
      return [];
    }
  }

  private async localeOf(userId: string): Promise<string> {
    return (await this.users.findById(userId))?.locale ?? 'en';
  }
}
