import { BadRequestException, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { NotificationSettings, TelegramLinkResponse } from '@pd/contracts';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from '../users/users.service';
import { coreMessages } from '../i18n/core.messages';
import { NotificationsService } from './notifications.service';
import { TelegramBotService } from './telegram/telegram-bot.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramBotService,
  ) {}

  @Get('settings')
  async settings(@CurrentUser() user: AuthUser): Promise<NotificationSettings> {
    const row = await this.users.findById(user.id);
    return {
      telegram: { available: this.telegram.isAvailable, connected: Boolean(row?.telegramChatId) },
    };
  }

  @Post('telegram/link')
  linkTelegram(@CurrentUser() user: AuthUser): TelegramLinkResponse {
    if (!this.telegram.isAvailable) {
      throw new BadRequestException('Telegram bot is not configured on the server');
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
      body: coreMessages((await this.users.findById(user.id))?.locale).testNotification,
      source: 'core',
    });
  }
}
