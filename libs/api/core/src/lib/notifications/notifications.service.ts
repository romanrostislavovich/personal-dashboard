import { Inject, Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { Notification, NOTIFICATION_CHANNELS, NotificationChannel } from './notification-channel';

/**
 * Single entry point for sending notifications from all modules.
 * A module does not know where the message goes — it just calls `send`.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly users: UsersService,
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: NotificationChannel[],
  ) {}

  async send(userId: string, notification: Notification): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      return;
    }

    const channels = this.channels.filter((channel) => channel.isEnabledFor(user));
    if (channels.length === 0) {
      this.logger.warn(`No notification channels for user ${user.email}: "${notification.title}"`);
      return;
    }

    // A failure in one channel must not affect the others.
    await Promise.all(
      channels.map((channel) =>
        channel
          .send(user, notification)
          .catch((error) => this.logger.error(`Channel ${channel.name} failed: ${error}`)),
      ),
    );
  }
}
