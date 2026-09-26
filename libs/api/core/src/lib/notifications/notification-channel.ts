import { UserRow } from '../users/users.schema';

export interface Notification {
  title: string;
  body: string;
  /** Модуль-источник, например `birthdays`. Пригодится для настроек «что куда слать». */
  source: string;
}

/**
 * Канал доставки уведомлений: Telegram, позже Discord, e-mail, push.
 * Чтобы добавить канал, реализуй интерфейс и зарегистрируй его в NotificationsModule
 * под токеном NOTIFICATION_CHANNELS.
 */
export interface NotificationChannel {
  readonly name: string;
  /** Может ли канал доставить сообщение этому пользователю (например, привязан ли Telegram). */
  isEnabledFor(user: UserRow): boolean;
  send(user: UserRow, notification: Notification): Promise<void>;
}

export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');
