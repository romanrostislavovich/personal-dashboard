import { Injectable } from '@nestjs/common';
import { GrammyError, HttpError } from 'grammy';
import { UserRow } from '../../users/users.schema';
import { DeliveryError, Notification, NotificationChannel } from '../notification-channel';
import { TelegramBotService } from './telegram-bot.service';

@Injectable()
export class TelegramChannel implements NotificationChannel {
  readonly name = 'telegram';
  readonly durable = true;

  constructor(private readonly bot: TelegramBotService) {}

  isEnabledFor(user: UserRow): boolean {
    return this.bot.isAvailable && user.telegramChatId !== null;
  }

  async send(user: UserRow, { title, body, actions }: Notification): Promise<void> {
    if (!user.telegramChatId) {
      throw new DeliveryError('Telegram is not connected', { permanent: true });
    }
    try {
      await this.bot.sendMessage(
        user.telegramChatId,
        `<b>${escapeHtml(title)}</b>\n${escapeHtml(body)}`,
        actions,
      );
    } catch (error) {
      throw deliveryError(error);
    }
  }
}

/** What Telegram's answer means for trying again (see DeliveryError). */
export function deliveryError(error: unknown): DeliveryError {
  if (error instanceof GrammyError) {
    const retryAfter = error.parameters.retry_after;
    return new DeliveryError(`Telegram ${error.error_code}: ${error.description}`, {
      retryAfterMs: retryAfter ? retryAfter * 1000 : undefined,
      // 400 (a chat that is gone, a broken message) and 403 (the bot is blocked) stay so.
      permanent: error.error_code === 400 || error.error_code === 403,
    });
  }
  if (error instanceof HttpError) {
    return new DeliveryError(`Telegram is unreachable: ${error.message}`);
  }
  return new DeliveryError(error instanceof Error ? error.message : String(error));
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
