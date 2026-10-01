import { UserRow } from '../users/users.schema';

/**
 * A button under a notification (Telegram shows it under the message): "Done", "In an hour".
 * `action` is `<name>:<payload>` — the name of a handler registered with
 * `TelegramBotService.registerAction` and what to pass to it; at most 64 bytes together.
 */
export interface NotificationAction {
  label: string;
  action: string;
}

export interface Notification {
  title: string;
  body: string;
  /** Source module, for example `birthdays`. Useful for "what goes where" settings. */
  source: string;
  /** Buttons to answer with; a channel that cannot show them just leaves them out. */
  actions?: NotificationAction[];
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
