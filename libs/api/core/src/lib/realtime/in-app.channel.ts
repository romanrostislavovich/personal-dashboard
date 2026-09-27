import { Injectable } from '@nestjs/common';
import { Notification, NotificationChannel } from '../notifications/notification-channel';
import { UserRow } from '../users/users.schema';
import { RealtimeService } from './realtime.service';

/**
 * Notifications as toasts in an open dashboard (and system notifications in the desktop app).
 * Achievements are skipped: they arrive as a richer `achievements` event instead.
 */
@Injectable()
export class InAppChannel implements NotificationChannel {
  readonly name = 'in-app';

  constructor(private readonly realtime: RealtimeService) {}

  isEnabledFor(user: UserRow): boolean {
    return this.realtime.isConnected(user.id);
  }

  async send(user: UserRow, { title, body, source }: Notification): Promise<void> {
    if (source !== 'achievements') {
      this.realtime.emit(user.id, { type: 'notification', title, body, source });
    }
  }
}
