import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerService } from '../scheduler/scheduler.service';
import { UserRow } from '../users/users.schema';
import { UsersService } from '../users/users.service';
import {
  DeliveryError,
  Notification,
  NOTIFICATION_CHANNELS,
  NotificationChannel,
} from './notification-channel';
import { NotificationOutbox } from './notification-outbox';
import { NotificationOutboxRow } from './notifications.schema';

/** Sources that are a service inside a section: they are hidden with the section. */
const SOURCE_SECTIONS: Record<string, string> = {
  wakatime: 'development',
  steam: 'games',
  spotify: 'music',
  lastfm: 'music',
};

/** The section a notification is about, as the menu names it. */
function sectionOfSource(source: string): string {
  return SOURCE_SECTIONS[source] ?? source;
}

/**
 * Single entry point for sending notifications from all modules.
 * A module does not know where the message goes — it just calls `send`.
 *
 * Every notification is written down first (NotificationOutbox): the same one within its
 * window goes out once, and a channel that failed is tried again by a job with a backoff.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly users: UsersService,
    private readonly outbox: NotificationOutbox,
    private readonly scheduler: SchedulerService,
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: NotificationChannel[],
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'notifications.retry',
      cron: '* * * * *',
      quiet: true,
      handler: () => this.retryDue(),
    });
    this.scheduler.register({
      name: 'notifications.prune',
      cron: '40 4 * * *',
      handler: () => this.outbox.prune(),
    });
  }

  async send(userId: string, notification: Notification): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      return;
    }
    // A section the user hid (Settings → Appearance) stays quiet too, not only out of the menu.
    if (this.users.hiddenSections(user).includes(sectionOfSource(notification.source))) {
      return;
    }

    const channels = this.channels.filter((channel) => channel.isEnabledFor(user));
    const durable = channels.filter((channel) => channel.durable).map((channel) => channel.name);
    const row = await this.outbox.add(
      userId,
      notification,
      durable,
      durable.length ? 'sending' : channels.length ? 'sent' : 'failed',
      channels.length ? null : 'No channel: Telegram is not connected and no tab is open',
    );
    if (!row) {
      return;
    }
    if (channels.length === 0) {
      this.logger.warn(`No notification channels for user ${user.email}: "${notification.title}"`);
      return;
    }
    // A toast is shown now or never: it is not tried again.
    await Promise.all(
      channels
        .filter((channel) => !channel.durable)
        .map((channel) =>
          channel
            .send(user, notification)
            .catch((error) => this.logger.error(`Channel ${channel.name} failed: ${error}`)),
        ),
    );
    if (durable.length) {
      await this.deliver(user, row);
    }
  }

  /** The ones that failed before and whose time has come (every minute). */
  async retryDue(): Promise<void> {
    for (const row of await this.outbox.claimDue()) {
      const user = await this.users.findById(row.userId);
      if (user) {
        await this.deliver(user, row);
      }
    }
  }

  /** To the channels the row still has to reach; one failing does not stop the others. */
  private async deliver(user: UserRow, row: NotificationOutboxRow): Promise<void> {
    const notification: Notification = {
      title: row.title,
      body: row.body,
      source: row.source,
      actions: row.actions,
    };
    const remaining: string[] = [];
    const errors: DeliveryError[] = [];
    for (const name of row.channels) {
      const channel = this.channels.find((one) => one.name === name);
      if (!channel?.isEnabledFor(user)) {
        // Disconnected since: nothing to try again.
        continue;
      }
      try {
        await channel.send(user, notification);
      } catch (error) {
        const failure = error instanceof DeliveryError ? error : new DeliveryError(String(error));
        this.logger.warn(`Channel ${name} failed (try ${row.attempts + 1}): ${failure.message}`);
        if (!failure.options.permanent) {
          remaining.push(name);
        }
        errors.push(failure);
      }
    }
    if (!errors.length) {
      await this.outbox.delivered(row.id);
      return;
    }
    await this.outbox.failed(row, remaining, errors.map((error) => error.message).join('; '), {
      retryAfterMs: Math.max(0, ...errors.map((error) => error.options.retryAfterMs ?? 0)),
      permanent: remaining.length === 0,
    });
  }
}
