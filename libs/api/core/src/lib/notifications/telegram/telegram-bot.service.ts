import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Locale, SUPPORTED_LOCALES, TelegramLinkResponse } from '@pd/contracts';
import { Bot, CommandContext, Context, Filter, InlineKeyboard } from 'grammy';
import type { Chat } from 'grammy/types';
import { randomBytes } from 'node:crypto';
import { fetchWithTimeout } from '../../net/outbound';
import { AppConfig } from '../../config/env';
import { coreMessages } from '../../i18n/core.messages';
import { FALLBACK_LOCALE, localize } from '../../i18n/locale';
import { UserActivityService } from '../../realtime/user-activity.service';
import { ServerKeysService } from '../../server-keys/server-keys.service';
import { UserRow } from '../../users/users.schema';
import { UsersService } from '../../users/users.service';
import { NotificationAction } from '../notification-channel';
import {
  BotAction,
  BotCommand,
  BotDocumentHandler,
  BotPhotoChoice,
  BotPhotoHandler,
  BotReply,
  BotTextHandler,
  BotVoice,
  BotVoiceTranscriber,
} from './bot-command';
import { splitMessage } from './split-message';

/** Telegram hides "typing…" after 5 seconds; AI answers can take longer. */
const TYPING_REFRESH_MS = 4_000;

const LINK_CODE_TTL_MS = 10 * 60 * 1000;
/** How long the bot waits for the answer to its question (see BotActionReply). */
const EXPECTED_TEXT_TTL_MS = 10 * 60 * 1000;
/** Buttons in a row under a message. */
const BUTTONS_PER_ROW = 3;
/** How often the token set in Settings → Notifications is looked at again. */
const RELOAD_MS = 60_000;
/** The Bot API does not let bots download larger files. */
const DOWNLOAD_LIMIT_BYTES = 20 * 1024 * 1024;

interface ExpectedText {
  handler: (user: UserRow, text: string) => Promise<string>;
  expiresAt: number;
}

interface PendingLink {
  userId: string;
  expiresAt: Date;
}

/**
 * Telegram bot. Uses long polling, so it does not need a public address:
 * it runs the same way on a server and locally.
 *
 * Linking a chat:
 * 1. In the dashboard settings the user clicks "Connect Telegram" → `createLink()`.
 * 2. Opens the `t.me/<bot>?start=<code>` link and presses Start.
 * 3. The bot receives `/start <code>` and saves the chat id for the user.
 */
/** A file from the chat (a photo, a voice message, a document) is downloaded in this long. */
const FILE_DOWNLOAD_TIMEOUT_MS = 60_000;
/** A photo waits this long for the user to say where it goes. */
const PENDING_PHOTO_TTL_MS = 30 * 60_000;
/** The photos of an album come as separate messages: the last is waited for this long. */
const ALBUM_WAIT_MS = 1_500;

/** One photo, or the photos of an album in order. */
interface Photos {
  caption: string;
  fileIds: string[];
}

interface PendingPhoto extends Photos {
  expiresAt: number;
}

interface Album extends Photos {
  ctx: Context;
  timer?: ReturnType<typeof setTimeout>;
}

type PhotoEntry = { choice: BotPhotoChoice; handler: BotPhotoHandler };

@Injectable()
export class TelegramBotService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramBotService.name);
  /** Running while the owner has set a token that works (Settings → Notifications). */
  private bot: Bot | null = null;
  // Codes live in memory for 10 minutes — enough for a single API instance.
  private readonly pendingLinks = new Map<string, PendingLink>();
  private readonly commands: BotCommand[] = [];
  private readonly actions: BotAction[] = [];
  /** Chats the bot asked something: the next message there is the answer. */
  private readonly expectedText = new Map<string, ExpectedText>();
  private readonly photoHandlers: PhotoEntry[] = [];
  /** Photos waiting for the user to say where they go (with several photo handlers). */
  private readonly pendingPhotos = new Map<string, PendingPhoto>();
  /** Albums still coming in, by chat and album. */
  private readonly albums = new Map<string, Album>();
  private documentHandler: BotDocumentHandler | null = null;
  private textHandler: BotTextHandler | null = null;
  private voiceTranscriber: BotVoiceTranscriber | null = null;
  private token: string | null = null;
  /** Why the bot with the token set did not start. */
  private botError: string | null = null;
  /** One change of the token at a time. */
  private reloading: Promise<void> = Promise.resolve();
  private reloadTimer: ReturnType<typeof setInterval> | undefined;
  /** A sync client leaves receiving messages to the server (see docs/sync.md). */
  private readonly isSyncClient: boolean;

  constructor(
    @Inject(ConfigService) config: AppConfig,
    private readonly users: UsersService,
    private readonly activity: UserActivityService,
    private readonly keys: ServerKeysService,
  ) {
    this.isSyncClient = config.get('SYNC_MODE', { infer: true }) === 'client';
    this.actions.push({
      name: 'pho',
      handler: (user, payload) => this.onPhotoChoice(user, payload),
    });
  }

  get isAvailable(): boolean {
    return this.bot !== null;
  }

  /** The bot's name, or why it did not start; both `null` — no token is set. */
  get status(): { username: string | null; error: string | null } {
    return { username: this.bot?.botInfo.username ?? null, error: this.botError };
  }

  /** The bot's name, if Telegram takes the token; throws otherwise. */
  static async check(token: string): Promise<string> {
    return (await new Bot(token).api.getMe()).username;
  }

  /** Modules add their commands in `onModuleInit` (see BotCommand). */
  registerCommand(command: BotCommand): void {
    this.commands.push(command);
  }

  /** Handlers of the buttons under the bot's messages (see BotAction). */
  registerAction(action: BotAction): void {
    this.actions.push(action);
  }

  /** Who answers plain text messages (see BotTextHandler). */
  registerTextHandler(handler: BotTextHandler): void {
    this.textHandler ??= handler;
  }

  /** A module that accepts photos from the chat (see BotPhotoHandler). */
  registerPhotoHandler(handler: BotPhotoHandler, choice: BotPhotoChoice): void {
    this.photoHandlers.push({ choice, handler });
  }

  /** Who turns voice messages into text (see BotVoiceTranscriber). */
  registerVoiceTranscriber(transcriber: BotVoiceTranscriber): void {
    this.voiceTranscriber ??= transcriber;
  }

  /** Who reads documents sent to the bot (see BotDocumentHandler). */
  registerDocumentHandler(handler: BotDocumentHandler): void {
    this.documentHandler ??= handler;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.reload();
    this.reloadTimer = setInterval(() => void this.reload(), RELOAD_MS);
    this.reloadTimer.unref();
  }

  /**
   * Starts the bot with the token the owner set, restarts it with a new one, stops it once the
   * token is removed. Called on start, after the owner changes the token, and every minute: on
   * a sync client a token set on the server arrives with the sync.
   */
  reload(): Promise<void> {
    this.reloading = this.reloading.then(() => this.applyToken());
    return this.reloading;
  }

  private async applyToken(): Promise<void> {
    const token = await this.keys.get('telegram.bot-token').catch(() => this.token);
    if (token === this.token) {
      return;
    }
    await this.stopBot();
    this.token = token;
    this.botError = null;
    if (!token) {
      this.logger.log('No Telegram bot token is set: Telegram notifications are off');
      return;
    }
    const bot = new Bot(token);
    try {
      if (this.isSyncClient) {
        // Only one process may receive the bot's messages — the server. Sending works here.
        await bot.init();
        this.bot = bot;
        this.logger.log('Sync client: the Telegram bot answers from the server');
        return;
      }
      this.listen(bot);
      await bot.init();
      await this.publishCommandMenu(bot);
      // start() resolves only when the bot stops, so we do not await it.
      bot.start({ drop_pending_updates: true }).catch((error: Error) => {
        this.botError = error.message;
        this.logger.warn(`The Telegram bot stopped: ${error.message}`);
      });
      this.bot = bot;
      this.logger.log(`Telegram bot @${bot.botInfo.username} started`);
    } catch (error) {
      this.botError = (error as Error).message;
      this.logger.warn(`The Telegram bot did not start: ${this.botError}`);
    }
  }

  private async stopBot(): Promise<void> {
    const bot = this.bot;
    this.bot = null;
    if (bot?.isRunning()) {
      await bot.stop();
    }
  }

  /** One handler per kind of update. */
  private listen(bot: Bot): void {
    bot.command('start', (ctx) => this.onStart(ctx));
    for (const command of this.commands) {
      bot.command(command.command, (ctx) => this.onCommand(ctx, command));
    }
    bot.on('message:photo', (ctx) => this.onPhoto(ctx));
    bot.on('message:document', (ctx) => this.onDocument(ctx));
    bot.on('message:voice', (ctx) =>
      this.onVoice(ctx, {
        ...ctx.message.voice,
        fileName: 'voice.ogg',
        mimeType: ctx.message.voice.mime_type ?? 'audio/ogg',
      }),
    );
    bot.on('message:audio', (ctx) =>
      this.onVoice(ctx, {
        ...ctx.message.audio,
        fileName: ctx.message.audio.file_name ?? 'audio.mp3',
        mimeType: ctx.message.audio.mime_type ?? 'audio/mpeg',
      }),
    );
    bot.on('callback_query:data', (ctx) => this.onButton(ctx));
    // Plain text (commands are handled above and never reach this point).
    bot.on('message:text', (ctx) => this.onText(ctx));
    bot.catch((error) => this.logger.error(error.message));
  }

  /** `/start <code>` from the link in the dashboard settings: links the chat to the user. */
  private async onStart(ctx: CommandContext<Context>): Promise<void> {
    // Until the chat is linked, the language comes from Telegram settings, then from the dashboard profile.
    const userId = this.consumeLinkCode(ctx.match);
    if (!userId) {
      await ctx.reply(coreMessages(ctx.from?.language_code).telegramLinkExpired);
      return;
    }
    await this.users.setTelegramChatId(userId, String(ctx.chat.id));
    const user = await this.users.findById(userId);
    await ctx.reply(coreMessages(user?.locale).telegramLinked);
  }

  private async onCommand(ctx: CommandContext<Context>, command: BotCommand): Promise<void> {
    const user = await this.linkedUserOrHint(ctx);
    if (user) {
      await this.answer(ctx, user, await command.handler(user, ctx.match.trim()));
    }
  }

  /**
   * A button under a message: its handler answers, the buttons go away (the choice is made),
   * and the handler may ask for a text — the user's next message.
   */
  private async onButton(ctx: Filter<Context, 'callback_query:data'>): Promise<void> {
    const chatId = String(ctx.chat?.id ?? ctx.from.id);
    const user = await this.users.findByTelegramChatId(chatId);
    const [name, ...payload] = ctx.callbackQuery.data.split(':');
    const action = this.actions.find((a) => a.name === name);
    // Telegram shows a spinner on the button until the press is answered.
    await ctx.answerCallbackQuery().catch(() => undefined);
    if (!user || !action) {
      return;
    }
    const result = await action.handler(user, payload.join(':'));
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    if (typeof result === 'string') {
      this.expectedText.delete(chatId);
      await this.answer(ctx, user, result);
      return;
    }
    this.expectedText.set(chatId, {
      handler: result.expectText,
      expiresAt: Date.now() + EXPECTED_TEXT_TTL_MS,
    });
    await this.answer(ctx, user, result.reply);
  }

  private async onText(ctx: Filter<Context, 'message:text'>): Promise<void> {
    if (ctx.message.text.startsWith('/')) {
      return;
    }
    const chatId = String(ctx.chat.id);
    const expected = this.expectedText.get(chatId);
    this.expectedText.delete(chatId);
    if (!expected && !this.textHandler) {
      return;
    }
    const user = await this.linkedUserOrHint(ctx);
    // The bot asked a question a moment ago: this message is the answer, not one for the assistant.
    if (user && expected && expected.expiresAt > Date.now()) {
      await this.answer(ctx, user, await expected.handler(user, ctx.message.text));
      return;
    }
    if (user) {
      await this.answer(
        ctx,
        user,
        await this.whileTyping(ctx, () => this.handleText(user, ctx.message.text)),
      );
    }
  }

  /**
   * A voice message: the recognized text is shown (so a misheard word is seen) and then
   * handled like a typed message.
   */
  private async onVoice(
    ctx: Context & { chat: Chat },
    voice: {
      file_id: string;
      file_size?: number;
      duration: number;
      fileName: string;
      mimeType: string;
    },
  ): Promise<void> {
    const transcriber = this.voiceTranscriber;
    const user = await this.linkedUserOrHint(ctx);
    if (!transcriber || !user) {
      return;
    }
    if (voice.file_size !== undefined && voice.file_size > DOWNLOAD_LIMIT_BYTES) {
      await ctx.reply(coreMessages(user.locale).telegramFileTooLarge);
      return;
    }
    const message: BotVoice = {
      fileName: voice.fileName,
      mimeType: voice.mimeType,
      durationSec: voice.duration,
      download: () => this.downloadFile(voice.file_id),
    };
    const result = await this.whileTyping(ctx, () => transcriber(user, message));
    if ('reply' in result) {
      await this.answer(ctx, user, result.reply);
      return;
    }
    for (const part of splitMessage(`🎤 ${result.text}`)) {
      await ctx.reply(part);
    }
    await this.answer(
      ctx,
      user,
      await this.whileTyping(ctx, () => this.handleText(user, result.text)),
    );
  }

  /** Text from the chat or from a voice message: `/command args` or a message to the assistant. */
  private async handleText(user: UserRow, text: string): Promise<string | BotReply> {
    const command = /^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/.exec(text.trim());
    if (command) {
      const found = this.commands.find((c) => c.command === command[1].toLowerCase());
      if (found) {
        return found.handler(user, command[2].trim());
      }
    }
    return this.textHandler ? this.textHandler(user, text) : '';
  }

  /**
   * Photos and documents from an unlinked chat are ignored silently. The photos of an album
   * are gathered first, so it is asked about and handled once.
   */
  private async onPhoto(ctx: Filter<Context, 'message:photo'>): Promise<void> {
    const user = await this.users.findByTelegramChatId(String(ctx.chat.id));
    if (!this.photoHandlers.length || !user) {
      return;
    }
    const largest = ctx.message.photo[ctx.message.photo.length - 1];
    const caption = ctx.message.caption ?? '';
    const group = ctx.message.media_group_id;
    if (!group) {
      await this.takePhotos(ctx, user, { caption, fileIds: [largest.file_id] });
      return;
    }
    const key = `${ctx.chat.id}:${group}`;
    const album = this.albums.get(key) ?? { ctx, caption: '', fileIds: [] };
    album.fileIds.push(largest.file_id);
    album.caption ||= caption;
    clearTimeout(album.timer);
    album.timer = setTimeout(() => {
      this.albums.delete(key);
      this.takePhotos(album.ctx, user, album).catch((error) =>
        this.logger.warn(`An album could not be taken: ${error}`),
      );
    }, ALBUM_WAIT_MS);
    this.albums.set(key, album);
  }

  /**
   * With one photo handler it takes the photos; with several the bot asks with buttons where
   * they go.
   */
  private async takePhotos(ctx: Context, user: UserRow, photos: Photos): Promise<void> {
    if (this.photoHandlers.length === 1) {
      await this.answer(ctx, user, await this.handlePhotos(user, this.photoHandlers[0], photos));
      return;
    }
    const token = randomBytes(6).toString('base64url');
    this.dropOldPhotos();
    this.pendingPhotos.set(token, {
      caption: photos.caption,
      fileIds: photos.fileIds,
      expiresAt: Date.now() + PENDING_PHOTO_TTL_MS,
    });
    const keyboard = new InlineKeyboard();
    for (const { choice } of this.photoHandlers) {
      keyboard.text(
        user.locale === 'ru' ? choice.label.ru : choice.label.en,
        `pho:${token}:${choice.id}`,
      );
    }
    await ctx.reply(coreMessages(user.locale).telegramPhotoWhere, { reply_markup: keyboard });
  }

  /** A button of the "where does this photo go" question. */
  private async onPhotoChoice(user: UserRow, payload: string): Promise<string> {
    const [token, id] = payload.split(':');
    const photo = this.pendingPhotos.get(token);
    const target = this.photoHandlers.find((entry) => entry.choice.id === id);
    if (!photo || !target || photo.expiresAt < Date.now()) {
      return coreMessages(user.locale).telegramPhotoExpired;
    }
    this.pendingPhotos.delete(token);
    return this.handlePhotos(user, target, photo);
  }

  /**
   * An album goes as one call to a handler that takes it whole, and photo by photo to the
   * others (the caption with the first); the same reply is said once.
   */
  private async handlePhotos(user: UserRow, entry: PhotoEntry, photos: Photos): Promise<string> {
    const pages = photos.fileIds.map((fileId) => ({
      mimeType: 'image/jpeg',
      download: () => this.downloadFile(fileId),
    }));
    if (entry.choice.wholeAlbum || pages.length === 1) {
      return entry.handler(user, { caption: photos.caption, ...pages[0], pages });
    }
    const replies: string[] = [];
    for (const [index, page] of pages.entries()) {
      replies.push(
        await entry.handler(user, {
          caption: index === 0 ? photos.caption : '',
          ...page,
          pages: [page],
        }),
      );
    }
    return [...new Set(replies.filter(Boolean))].join('\n');
  }

  private dropOldPhotos(): void {
    const now = Date.now();
    for (const [token, photo] of this.pendingPhotos) {
      if (photo.expiresAt < now) {
        this.pendingPhotos.delete(token);
      }
    }
  }

  private async onDocument(ctx: Filter<Context, 'message:document'>): Promise<void> {
    const handler = this.documentHandler;
    const user = await this.users.findByTelegramChatId(String(ctx.chat.id));
    if (!handler || !user) {
      return;
    }
    const { file_id, file_name, file_size } = ctx.message.document;
    if (file_size !== undefined && file_size > DOWNLOAD_LIMIT_BYTES) {
      await ctx.reply(coreMessages(user.locale).telegramFileTooLarge);
      return;
    }
    const document = {
      fileName: file_name ?? 'file',
      caption: ctx.message.caption ?? '',
      download: () => this.downloadFile(file_id),
    };
    await this.answer(ctx, user, await this.whileTyping(ctx, () => handler(user, document)));
  }

  /** The user this chat is linked to; otherwise tells the chat how to link it. */
  private async linkedUserOrHint(ctx: Context & { chat: Chat }): Promise<UserRow | null> {
    const user = await this.users.findByTelegramChatId(String(ctx.chat.id));
    if (!user) {
      await ctx.reply(coreMessages(ctx.from?.language_code).telegramNotLinked);
    }
    return user ?? null;
  }

  /** An empty reply: the handler has answered on its own (a message with buttons). */
  private async answer(ctx: Context, user: UserRow, reply: string | BotReply): Promise<void> {
    const { text, buttons } = typeof reply === 'string' ? { text: reply, buttons: [] } : reply;
    // A long answer goes as several messages; the buttons are under the last one.
    const parts = splitMessage(text);
    for (const [index, part] of parts.entries()) {
      if (index === parts.length - 1 && buttons.length) {
        const keyboard = new InlineKeyboard();
        buttons.forEach(({ label, action }) => keyboard.text(label, action));
        await ctx.reply(part, { reply_markup: keyboard });
      } else {
        await ctx.reply(part);
      }
    }
    this.activity.touched(user.id);
  }

  /** Telegram command menu (the "/" button): English by default plus one per language. */
  private async publishCommandMenu(bot: Bot): Promise<void> {
    const commandsFor = (locale: Locale) =>
      this.commands.map(({ command, description }) => ({
        command,
        description: localize(description, locale),
      }));
    await bot.api.setMyCommands(commandsFor(FALLBACK_LOCALE));
    for (const locale of SUPPORTED_LOCALES) {
      await bot.api.setMyCommands(commandsFor(locale), { language_code: locale });
    }
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.reloadTimer);
    await this.stopBot();
  }

  createLink(userId: string): TelegramLinkResponse {
    if (!this.bot) {
      throw new Error('Telegram bot is not configured');
    }
    if (this.isSyncClient) {
      // The link code is checked by the process that receives /start — the server.
      throw new BadRequestException('Connect Telegram on the server instance');
    }
    const code = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
    this.pendingLinks.set(code, { userId, expiresAt });
    return {
      deepLink: `https://t.me/${this.bot.botInfo.username}?start=${code}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * `actions` become buttons under the message (see NotificationAction). A text over Telegram's
   * limit goes as several messages, the buttons under the last one.
   */
  async sendMessage(
    chatId: string,
    html: string,
    actions: NotificationAction[] = [],
  ): Promise<void> {
    const keyboard = new InlineKeyboard();
    actions.forEach(({ label, action }, index) => {
      if (index > 0 && index % BUTTONS_PER_ROW === 0) {
        keyboard.row();
      }
      keyboard.text(label, action);
    });
    const parts = splitMessage(html);
    for (const [index, part] of parts.entries()) {
      const last = index === parts.length - 1;
      await this.bot?.api.sendMessage(chatId, part, {
        parse_mode: 'HTML',
        ...(last && actions.length ? { reply_markup: keyboard } : {}),
      });
    }
  }

  /** Shows "typing…" until a slow reply (an AI answer) is ready. */
  private async whileTyping<T>(ctx: Context, work: () => Promise<T>): Promise<T> {
    await ctx.replyWithChatAction('typing');
    const typing = setInterval(
      () => void ctx.replyWithChatAction('typing').catch(() => undefined),
      TYPING_REFRESH_MS,
    );
    try {
      return await work();
    } finally {
      clearInterval(typing);
    }
  }

  /** Files are downloaded from the Bot API file server by their path. */
  private async downloadFile(fileId: string): Promise<Buffer> {
    const file = await this.bot?.api.getFile(fileId);
    if (!file?.file_path) {
      throw new Error('Telegram did not return a file path');
    }
    const response = await fetchWithTimeout(
      `https://api.telegram.org/file/bot${this.token}/${file.file_path}`,
      {},
      FILE_DOWNLOAD_TIMEOUT_MS,
    );
    if (!response.ok) {
      throw new Error(`Telegram file download failed: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private consumeLinkCode(code: string): string | null {
    const link = this.pendingLinks.get(code);
    this.pendingLinks.delete(code);
    return link && link.expiresAt > new Date() ? link.userId : null;
  }
}
