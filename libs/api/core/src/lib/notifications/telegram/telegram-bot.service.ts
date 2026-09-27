import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Locale, SUPPORTED_LOCALES, TelegramLinkResponse } from '@pd/contracts';
import { Bot } from 'grammy';
import { randomBytes } from 'node:crypto';
import { AppConfig } from '../../config/env';
import { coreMessages } from '../../i18n/core.messages';
import { FALLBACK_LOCALE, localize } from '../../i18n/locale';
import { UsersService } from '../../users/users.service';
import { BotCommand } from './bot-command';

const LINK_CODE_TTL_MS = 10 * 60 * 1000;

interface PendingLink {
  userId: string;
  expiresAt: Date;
}

/**
 * Telegram-бот. Работает через long polling, поэтому ему не нужен публичный адрес:
 * одинаково запускается и на сервере, и локально.
 *
 * Привязка чата:
 * 1. В настройках дашборда пользователь жмёт «Подключить Telegram» → `createLink()`.
 * 2. Открывает ссылку `t.me/<bot>?start=<code>` и нажимает Start.
 * 3. Бот получает `/start <code>` и сохраняет chat id пользователю.
 */
@Injectable()
export class TelegramBotService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly bot: Bot | null;
  // Коды живут в памяти 10 минут — для одного инстанса API этого достаточно.
  private readonly pendingLinks = new Map<string, PendingLink>();
  private readonly commands: BotCommand[] = [];

  constructor(
    @Inject(ConfigService) config: AppConfig,
    private readonly users: UsersService,
  ) {
    const token = config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    this.bot = token ? new Bot(token) : null;
  }

  get isAvailable(): boolean {
    return this.bot !== null;
  }

  /** Модули добавляют свои команды в `onModuleInit` (см. BotCommand). */
  registerCommand(command: BotCommand): void {
    this.commands.push(command);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.bot) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set, Telegram notifications are disabled');
      return;
    }

    // Пока чат не привязан, язык берём из настроек Telegram, потом — из профиля дашборда.
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
      });
    }
    this.bot.catch((error) => this.logger.error(error.message));

    await this.bot.init();
    // Меню команд в Telegram (кнопка «/»): по умолчанию на английском + отдельно для каждого языка.
    const commandsFor = (locale: Locale) =>
      this.commands.map(({ command, description }) => ({
        command,
        description: localize(description, locale),
      }));
    await this.bot.api.setMyCommands(commandsFor(FALLBACK_LOCALE));
    for (const locale of SUPPORTED_LOCALES) {
      await this.bot.api.setMyCommands(commandsFor(locale), { language_code: locale });
    }
    // start() резолвится только при остановке бота, поэтому не ждём его.
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

  private consumeLinkCode(code: string): string | null {
    const link = this.pendingLinks.get(code);
    this.pendingLinks.delete(code);
    return link && link.expiresAt > new Date() ? link.userId : null;
  }
}
