import { LocalizedText } from '../../i18n/locale';
import { UserRow } from '../../users/users.schema';

/**
 * Команда Telegram-бота, которую добавляет модуль. Пример из дневника:
 *
 * ```ts
 * telegram.registerCommand({
 *   command: 'd',
 *   description: { en: 'Diary entry', ru: 'Запись в дневник' },
 *   handler: (user, text) => this.diary.append(user.id, text),
 * });
 * ```
 *
 * Регистрировать нужно в `onModuleInit` — бот подключает команды при старте приложения.
 */
export interface BotCommand {
  /** Без слэша, латиницей: `d` → `/d`. */
  command: string;
  /** Подсказка в меню команд Telegram — на каждом языке. */
  description: LocalizedText;
  /**
   * Вызывается только для пользователей, которые привязали Telegram.
   * `args` — текст после команды. Возвращает ответ бота (обычный текст).
   */
  handler: (user: UserRow, args: string) => Promise<string>;
}
