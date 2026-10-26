import { Injectable } from '@nestjs/common';
import { Notification, NotificationChannel } from '../notifications/notification-channel';
import { linkOf } from '../notifications/notification-link';
import { UserRow } from '../users/users.schema';
import { RealtimeService } from './realtime.service';

/**
 * Notifications as toasts in an open dashboard (and system notifications in the desktop app).
 * Achievements are skipped: they arrive as a richer `achievements` event instead.
 */
@Injectable()
export class InAppChannel implements NotificationChannel {
  readonly name = 'in-app';
  readonly durable = false;

  constructor(private readonly realtime: RealtimeService) {}

  isEnabledFor(user: UserRow): boolean {
    return this.realtime.isConnected(user.id);
  }

  async send(user: UserRow, notification: Notification): Promise<void> {
    const { title, body, source, desktop } = notification;
    if (source !== 'achievements') {
      this.realtime.emit(user.id, {
        type: 'notification',
        title,
        body,
        source,
        system: desktop ?? true,
        route: linkOf(notification),
      });
    }
  }
}
