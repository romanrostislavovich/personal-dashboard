import { UserRow } from '../users/users.schema';

export interface Notification {
  title: string;
  body: string;
  /** Source module, for example `birthdays`. Useful for "what goes where" settings. */
  source: string;
}

/**
 * A notification delivery channel: Telegram, later Discord, e-mail, push.
 * To add a channel, implement the interface and register it in NotificationsModule
 * under the NOTIFICATION_CHANNELS token.
 */
export interface NotificationChannel {
  readonly name: string;
  /** Whether the channel can deliver to this user (for example, whether Telegram is linked). */
  isEnabledFor(user: UserRow): boolean;
  send(user: UserRow, notification: Notification): Promise<void>;
}

export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');
