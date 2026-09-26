import { Inject, Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { Notification, NOTIFICATION_CHANNELS, NotificationChannel } from './notification-channel';

/**
 * Единая точка отправки уведомлений для всех модулей.
 * Модуль не знает, куда уйдёт сообщение, — он просто вызывает `send`.
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

    // Падение одного канала не должно мешать остальным.
    await Promise.all(
      channels.map((channel) =>
        channel
          .send(user, notification)
          .catch((error) => this.logger.error(`Channel ${channel.name} failed: ${error}`)),
      ),
    );
  }
}
