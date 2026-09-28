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

/** A photo sent to the bot by a user who has linked Telegram. */
export interface BotPhoto {
  caption: string;
  /** Telegram photos are JPEG; the largest available size is downloaded. */
  mimeType: string;
  download: () => Promise<Buffer>;
}

/**
 * Handles photos sent to the bot (the diary saves them to today's entry).
 * Returns the bot reply. Only one module can own photos — the first registered handler.
 */
export type BotPhotoHandler = (user: UserRow, photo: BotPhoto) => Promise<string>;

/** A file sent to the bot as a document (not as a compressed photo). */
export interface BotDocument {
  fileName: string;
  caption: string;
  download: () => Promise<Buffer>;
}

/**
 * Handles documents sent to the bot (the AI assistant reads them).
 * Returns the bot reply. Only one handler owns documents — the first registered.
 */
export type BotDocumentHandler = (user: UserRow, document: BotDocument) => Promise<string>;

/**
 * Handles plain text messages (not commands) — the AI assistant.
 * Returns the bot reply. Only one handler owns free text — the first registered.
 */
export type BotTextHandler = (user: UserRow, text: string) => Promise<string>;
