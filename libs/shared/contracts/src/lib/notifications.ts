export interface NotificationSettings {
  telegram: {
    /** Бот настроен на сервере (задан TELEGRAM_BOT_TOKEN). */
    available: boolean;
    /** Пользователь привязал свой Telegram-чат. */
    connected: boolean;
  };
}

export interface TelegramLinkResponse {
  /** Ссылка вида https://t.me/<bot>?start=<code>; открыть её и нажать «Start». */
  deepLink: string;
  expiresAt: string;
}
