import { Inject, Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { Notification, NOTIFICATION_CHANNELS, NotificationChannel } from './notification-channel';

/** Sources that are a service inside a section: they are hidden with the section. */
const SOURCE_SECTIONS: Record<string, string> = {
  wakatime: 'development',
  steam: 'games',
  spotify: 'music',
  lastfm: 'music',
};

/** The section a notification is about, as the menu names it. */
export function sectionOfSource(source: string): string {
  return SOURCE_SECTIONS[source] ?? source;
}

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
    // A section the user hid (Settings → Appearance) stays quiet too, not only out of the menu.
    if (this.users.hiddenSections(user).includes(sectionOfSource(notification.source))) {
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
