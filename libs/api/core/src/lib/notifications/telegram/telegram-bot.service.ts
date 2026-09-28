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
import { Bot, Context } from 'grammy';
import { randomBytes } from 'node:crypto';
import { AppConfig } from '../../config/env';
import { coreMessages } from '../../i18n/core.messages';
import { FALLBACK_LOCALE, localize } from '../../i18n/locale';
import { UserActivityService } from '../../realtime/user-activity.service';
import { UsersService } from '../../users/users.service';
import { BotCommand, BotDocumentHandler, BotPhotoHandler, BotTextHandler } from './bot-command';

/** Telegram hides "typing…" after 5 seconds; AI answers can take longer. */
const TYPING_REFRESH_MS = 4_000;

const LINK_CODE_TTL_MS = 10 * 60 * 1000;
/** The Bot API does not let bots download larger files. */
const DOWNLOAD_LIMIT_BYTES = 20 * 1024 * 1024;

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
@Injectable()
export class TelegramBotService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly bot: Bot | null;
  // Codes live in memory for 10 minutes — enough for a single API instance.
  private readonly pendingLinks = new Map<string, PendingLink>();
  private readonly commands: BotCommand[] = [];
  private photoHandler: BotPhotoHandler | null = null;
  private documentHandler: BotDocumentHandler | null = null;
  private textHandler: BotTextHandler | null = null;
  private readonly token: string | undefined;
  /** A sync client leaves receiving messages to the server (see docs/sync.md). */
  private readonly isSyncClient: boolean;

  constructor(
    @Inject(ConfigService) config: AppConfig,
    private readonly users: UsersService,
    private readonly activity: UserActivityService,
  ) {
    this.token = config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    this.isSyncClient = config.get('SYNC_MODE', { infer: true }) === 'client';
    this.bot = this.token ? new Bot(this.token) : null;
  }

  get isAvailable(): boolean {
    return this.bot !== null;
  }

  /** Modules add their commands in `onModuleInit` (see BotCommand). */
  registerCommand(command: BotCommand): void {
    this.commands.push(command);
  }

  /** Who answers plain text messages (see BotTextHandler). */
  registerTextHandler(handler: BotTextHandler): void {
    this.textHandler ??= handler;
  }

  /** A module that accepts photos from the chat (see BotPhotoHandler). */
  registerPhotoHandler(handler: BotPhotoHandler): void {
    this.photoHandler ??= handler;
  }

  /** Who reads documents sent to the bot (see BotDocumentHandler). */
  registerDocumentHandler(handler: BotDocumentHandler): void {
    this.documentHandler ??= handler;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.bot) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set, Telegram notifications are disabled');
      return;
    }
    if (this.isSyncClient) {
      // Only one process may receive the bot's messages — the server. Sending still works here.
      await this.bot.init();
      this.logger.log('Sync client: the Telegram bot answers from the server');
      return;
    }

    // Until the chat is linked, the language comes from Telegram settings, then from the dashboard profile.
    this.bot.command('start', async (ctx) => {
      const userId = this.consumeLinkCode(ctx.match);
      if (!userId) {
        await ctx.reply(coreMessages(ctx.from?.language_code).telegramLinkExpired);
        return;
      }
      await this.users.setTelegramChatId(userId, String(ctx.chat.id));
      const user = await this.users.findById(userId);
      await ctx.reply(coreMessages(user?.locale).telegramLinked);
    });
    for (const command of this.commands) {
      this.bot.command(command.command, async (ctx) => {
        const user = await this.users.findByTelegramChatId(String(ctx.chat.id));
        if (!user) {
          await ctx.reply(coreMessages(ctx.from?.language_code).telegramNotLinked);
          return;
        }
        await ctx.reply(await command.handler(user, ctx.match.trim()));
        this.activity.touched(user.id);
      });
    }
    this.bot.on('message:photo', async (ctx) => {
      const handler = this.photoHandler;
      const user = await this.users.findByTelegramChatId(String(ctx.chat.id));
      if (!handler || !user) {
        return;
      }
      const largest = ctx.message.photo[ctx.message.photo.length - 1];
      const reply = await handler(user, {
        caption: ctx.message.caption ?? '',
        mimeType: 'image/jpeg',
        download: () => this.downloadFile(largest.file_id),
      });
      await ctx.reply(reply);
      this.activity.touched(user.id);
    });
    this.bot.on('message:document', async (ctx) => {
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
      await ctx.reply(await this.whileTyping(ctx, () => handler(user, document)));
      this.activity.touched(user.id);
    });
    // Plain text (commands are handled above and never reach this point).
    this.bot.on('message:text', async (ctx) => {
      const handler = this.textHandler;
      if (!handler || ctx.message.text.startsWith('/')) {
        return;
      }
      const user = await this.users.findByTelegramChatId(String(ctx.chat.id));
      if (!user) {
        await ctx.reply(coreMessages(ctx.from?.language_code).telegramNotLinked);
        return;
      }
      await ctx.reply(await this.whileTyping(ctx, () => handler(user, ctx.message.text)));
      this.activity.touched(user.id);
    });
    this.bot.catch((error) => this.logger.error(error.message));

    await this.bot.init();
    // Telegram command menu (the "/" button): English by default plus one per language.
    const commandsFor = (locale: Locale) =>
      this.commands.map(({ command, description }) => ({
        command,
        description: localize(description, locale),
      }));
    await this.bot.api.setMyCommands(commandsFor(FALLBACK_LOCALE));
    for (const locale of SUPPORTED_LOCALES) {
      await this.bot.api.setMyCommands(commandsFor(locale), { language_code: locale });
    }
    // start() resolves only when the bot stops, so we do not await it.
    void this.bot.start({ drop_pending_updates: true });
    this.logger.log(`Telegram bot @${this.bot.botInfo.username} started`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.bot?.stop();
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

  async sendMessage(chatId: string, html: string): Promise<void> {
    await this.bot?.api.sendMessage(chatId, html, { parse_mode: 'HTML' });
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
    const response = await fetch(
      `https://api.telegram.org/file/bot${this.token}/${file.file_path}`,
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
