import type { UserRow } from '../users/users.schema';

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
  /**
   * The same `key` within `minutes` goes out once: a price that jumps back and forth, a
   * certificate checked every hour. Without it a notification with the same text is not sent
   * again within a few minutes (a job run twice).
   */
  dedupe?: { key: string; minutes: number };
  /**
   * Asked for by the user right now (a test): it goes out in their quiet hours too, which hold
   * every other one until morning (see CalmSettings).
   */
  now?: boolean;
}

/**
 * Why a channel could not deliver: `retryAfterMs` — the service asked to wait (Telegram's 429);
 * `permanent` — trying again will not help (the bot is blocked, the chat is gone).
 */
export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly options: { retryAfterMs?: number; permanent?: boolean } = {},
  ) {
    super(message);
  }
}

/**
 * A notification delivery channel: Telegram, later Discord, e-mail, push.
 * To add a channel, implement the interface and register it in NotificationsModule
 * under the NOTIFICATION_CHANNELS token.
 */
export interface NotificationChannel {
  readonly name: string;
  /**
   * The message stays there (Telegram): a failed delivery is tried again later. A toast in an
   * open tab is not — it is shown now or never.
   */
  readonly durable: boolean;
  /** Whether the channel can deliver to this user (for example, whether Telegram is linked). */
  isEnabledFor(user: UserRow): boolean;
  send(user: UserRow, notification: Notification): Promise<void>;
}

export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');
