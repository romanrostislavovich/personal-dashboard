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
