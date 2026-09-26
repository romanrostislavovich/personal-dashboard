import { Injectable } from '@nestjs/common';
import { UserRow } from '../../users/users.schema';
import { Notification, NotificationChannel } from '../notification-channel';
import { TelegramBotService } from './telegram-bot.service';

@Injectable()
export class TelegramChannel implements NotificationChannel {
  readonly name = 'telegram';

  constructor(private readonly bot: TelegramBotService) {}

  isEnabledFor(user: UserRow): boolean {
    return this.bot.isAvailable && user.telegramChatId !== null;
  }

  async send(user: UserRow, { title, body }: Notification): Promise<void> {
    if (!user.telegramChatId) {
      return;
    }
    await this.bot.sendMessage(
      user.telegramChatId,
      `<b>${escapeHtml(title)}</b>\n${escapeHtml(body)}`,
    );
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
