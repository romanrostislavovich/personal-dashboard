import { Injectable } from '@nestjs/common';
import { UserRow } from '../../users/users.schema';
import { Notification, NotificationChannel } from '../notification-channel';
import { PushService } from './push.service';

/**
 * Push notifications on the user's phones, next to Telegram. Durable like Telegram: a phone
 * Firebase could not reach now is tried again by the outbox.
 */
@Injectable()
export class PushChannel implements NotificationChannel {
  readonly name = 'push';
  readonly durable = true;

  constructor(private readonly push: PushService) {}

  isEnabledFor(user: UserRow): boolean {
    return this.push.canSendTo(user.id);
  }

  async send(user: UserRow, notification: Notification): Promise<void> {
    await this.push.send(user, notification);
  }
}
