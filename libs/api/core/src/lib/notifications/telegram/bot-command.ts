import { UserRow } from '../../users/users.schema';

/**
 * Команда Telegram-бота, которую добавляет модуль. Пример из дневника:
 *
 * ```ts
 * telegram.registerCommand({
 *   command: 'd',
 *   description: 'Запись в дневник',
 *   handler: (user, text) => this.diary.append(user.id, text),
 * });
 * ```
 *
 * Регистрировать нужно в `onModuleInit` — бот подключает команды при старте приложения.
 */
export interface BotCommand {
  /** Без слэша, латиницей: `d` → `/d`. */
  command: string;
  /** Подсказка в меню команд Telegram. */
  description: string;
  /**
   * Вызывается только для пользователей, которые привязали Telegram.
   * `args` — текст после команды. Возвращает ответ бота (обычный текст).
   */
  handler: (user: UserRow, args: string) => Promise<string>;
}
