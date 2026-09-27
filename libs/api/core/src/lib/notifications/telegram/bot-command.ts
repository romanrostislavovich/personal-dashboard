import { LocalizedText } from '../../i18n/locale';
import { UserRow } from '../../users/users.schema';

/**
 * A Telegram bot command added by a module. Example from the diary:
 *
 * ```ts
 * telegram.registerCommand({
 *   command: 'd',
 *   description: { en: 'Diary entry', ru: 'Запись в дневник' },
 *   handler: (user, text) => this.diary.append(user.id, text),
 * });
 * ```
 *
 * Register it in `onModuleInit` — the bot attaches commands when the app starts.
 */
export interface BotCommand {
  /** Without the slash, Latin letters: `d` → `/d`. */
  command: string;
  /** Hint in the Telegram command menu — one per language. */
  description: LocalizedText;
  /**
   * Called only for users who have linked Telegram.
   * `args` is the text after the command. Returns the bot reply (plain text).
   */
  handler: (user: UserRow, args: string) => Promise<string>;
}
