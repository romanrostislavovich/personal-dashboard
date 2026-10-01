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

/**
 * What a pressed button answers: a text, or a text plus a question — the user's next message
 * then goes to `expectText` instead of the assistant ("When to remind?" → "tomorrow 9:00").
 */
export type BotActionReply =
  string | { reply: string; expectText: (user: UserRow, text: string) => Promise<string> };

/**
 * A handler of buttons under the bot's messages (see NotificationAction). Example:
 *
 * ```ts
 * telegram.registerAction({
 *   name: 'rem',
 *   handler: (user, payload) => this.reminders.answer(user, payload),
 * });
 * // a button: { label: 'Done', action: 'rem:done:<id>' } → handler(user, 'done:<id>')
 * ```
 */
export interface BotAction {
  /** Short, Latin letters: it is part of the 64 bytes a button carries. */
  name: string;
  handler: (user: UserRow, payload: string) => Promise<BotActionReply>;
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

/** A voice message (or an audio file) sent to the bot. */
export interface BotVoice {
  /** With the extension, which tells speech recognition the format: `voice.ogg`. */
  fileName: string;
  mimeType: string;
  durationSec: number;
  download: () => Promise<Buffer>;
}

/** The recognized text, or a reply explaining why there is none (recognition is not set up…). */
export type BotTranscription = { text: string } | { reply: string };

/**
 * Turns voice messages into text (the AI core, through a speech recognition connection).
 * The bot then handles the text like a typed message: a `/command` or the assistant.
 */
export type BotVoiceTranscriber = (user: UserRow, voice: BotVoice) => Promise<BotTranscription>;
