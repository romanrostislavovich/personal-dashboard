import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
} from '@nestjs/common';
import {
  NotificationLog,
  NotificationSettings,
  TelegramBotInput,
  telegramBotInputSchema,
  TelegramLinkResponse,
} from '@pd/contracts';
import {AuthUser, CurrentUser} from '../auth/current-user.decorator';
import {ServerKeysService} from '../server-keys/server-keys.service';
import {UsersService} from '../users/users.service';
import {ZodValidationPipe} from '../validation/zod-validation.pipe';
import {coreMessages} from '../i18n/core.messages';
import {NotificationOutbox} from './notification-outbox';
import {NotificationsService} from './notifications.service';
import {TelegramBotService} from './telegram/telegram-bot.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly outbox: NotificationOutbox,
    private readonly telegram: TelegramBotService,
    private readonly keys: ServerKeysService,
  ) {}

  @Get('settings')
  async settings(@CurrentUser() user: AuthUser): Promise<NotificationSettings> {
    const row = await this.users.findById(user.id);
    const owner = await this.keys.isOwner(user.id);
    return {
      telegram: {
        available: this.telegram.isAvailable,
        connected: Boolean(row?.telegramChatId),
        bot: owner
          ? {
              tokenSet: Boolean(await this.keys.get('telegram.bot-token')),
              ...this.telegram.status,
            }
          : null,
      },
    };
  }

  /** The owner sets the bot's token: checked with Telegram first, then the bot restarts. */
  @Put('telegram/bot')
  @HttpCode(204)
  async setBot(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(telegramBotInputSchema))
    input: TelegramBotInput,
  ): Promise<void> {
    await this.keys.assertOwner(user.id);
    await TelegramBotService.check(input.token).catch(() => {
      throw new BadRequestException('Telegram does not accept this token');
    });
    await this.keys.set('telegram.bot-token', input.token);
    await this.telegram.reload();
  }

  @Delete('telegram/bot')
  @HttpCode(204)
  async removeBot(@CurrentUser() user: AuthUser): Promise<void> {
    await this.keys.assertOwner(user.id);
    await this.keys.set('telegram.bot-token', null);
    await this.telegram.reload();
  }

  /** What became of the latest notifications: sent, tried again, failed, sent once. */
  @Get('log')
  log(@CurrentUser() user: AuthUser): Promise<NotificationLog> {
    return this.outbox.log(user.id);
  }

  @Post('telegram/link')
  linkTelegram(@CurrentUser() user: AuthUser): TelegramLinkResponse {
    if (!this.telegram.isAvailable) {
      throw new BadRequestException(
        'Telegram bot is not configured on the server',
      );
    }
    return this.telegram.createLink(user.id);
  }

  @Delete('telegram')
  @HttpCode(204)
  unlinkTelegram(@CurrentUser() user: AuthUser) {
    return this.users.setTelegramChatId(user.id, null);
  }

  @Post('test')
  @HttpCode(204)
  async test(@CurrentUser() user: AuthUser) {
    return this.notifications.send(user.id, {
      title: 'Personal Dashboard',
      body: coreMessages((await this.users.findById(user.id))?.locale)
        .testNotification,
      source: 'core',
      now: true,
    });
  }
}
