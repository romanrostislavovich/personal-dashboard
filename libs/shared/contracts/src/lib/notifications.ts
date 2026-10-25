import { z } from 'zod';

export interface NotificationSettings {
  telegram: {
    /** The bot is running: the owner set its token (Settings → Notifications). */
    available: boolean;
    /** The user has linked their Telegram chat. */
    connected: boolean;
    /** For the owner, who sets the bot; `null` for the others. */
    bot: TelegramBotState | null;
  };
}

export interface TelegramBotState {
  tokenSet: boolean;
  /** The bot's name in Telegram, once it runs. */
  username: string | null;
  /** Why the bot with this token did not start. */
  error: string | null;
}

/** `PUT /api/notifications/telegram/bot`: the token @BotFather gave (`123456:ABC…`). */
export const telegramBotInputSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^\d{5,}:[\w-]{30,}$/),
});
export type TelegramBotInput = z.infer<typeof telegramBotInputSchema>;

export interface TelegramLinkResponse {
  /** A link like https://t.me/<bot>?start=<code>; open it and press "Start". */
  deepLink: string;
  expiresAt: string;
}

/**
 * What became of a notification: `sending` — on its way now; `pending` — a channel failed and it
 * is tried again later; `deduplicated` — the same one went out a moment ago, so not again;
 * `held` — made in the user's quiet hours, it waits for their end (see CalmSettings).
 */
export const NOTIFICATION_DELIVERY_STATUSES = [
  'held',
  'sending',
  'pending',
  'sent',
  'failed',
  'deduplicated',
] as const;
export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

/** A line of the delivery log (Settings → Notifications). */
export interface NotificationDelivery {
  id: string;
  source: string;
  title: string;
  status: NotificationDeliveryStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  sentAt: string | null;
}

/** `GET /api/notifications/log`: the latest notifications and the counts of the last week. */
export interface NotificationLog {
  items: NotificationDelivery[];
  week: Record<NotificationDeliveryStatus, number>;
}
