export interface NotificationSettings {
  telegram: {
    /** The bot is configured on the server (TELEGRAM_BOT_TOKEN is set). */
    available: boolean;
    /** The user has linked their Telegram chat. */
    connected: boolean;
  };
}

export interface TelegramLinkResponse {
  /** A link like https://t.me/<bot>?start=<code>; open it and press "Start". */
  deepLink: string;
  expiresAt: string;
}

/**
 * What became of a notification: `sending` — on its way now; `pending` — a channel failed and it
 * is tried again later; `deduplicated` — the same one went out a moment ago, so not again.
 */
export const NOTIFICATION_DELIVERY_STATUSES = [
  'sending',
  'pending',
  'sent',
  'failed',
  'deduplicated',
] as const;
export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

/** A line of the delivery log (Settings → Integrations). */
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
