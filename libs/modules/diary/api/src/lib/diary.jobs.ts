import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  NotificationsService,
  SchedulerService,
  TelegramBotService,
  UsersService,
} from '@pd/api-core';
import { diaryMessages } from './diary.messages';
import { DiarySummaryService } from './diary-summary.service';
import { DiaryService } from './diary.service';

/**
 * Связь дневника с внешним миром:
 * - команда бота `/d текст` дописывает заметку в сегодняшнюю запись;
 * - в 21:00 напоминание тем, кто включил его и ещё не писал сегодня;
 * - по воскресеньям в 20:00 — AI-саммари недели (для тех, кто включил).
 */
@Injectable()
export class DiaryJobs implements OnModuleInit {
  private readonly logger = new Logger(DiaryJobs.name);

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly telegram: TelegramBotService,
    private readonly users: UsersService,
    private readonly diary: DiaryService,
    private readonly notifications: NotificationsService,
    private readonly summaries: DiarySummaryService,
  ) {}

  onModuleInit(): void {
    const text = diaryMessages('ru');
    this.telegram.registerCommand({
      command: 'd',
      description: text.commandDescription,
      handler: async (user, note) => {
        const replies = diaryMessages(user.locale);
        if (!note) {
          return replies.usage;
        }
        await this.diary.appendToToday(user.id, note);
        return replies.saved;
      },
    });

    this.scheduler.register({
      name: 'diary.evening-reminder',
      cron: '0 21 * * *',
      handler: () => this.remind(),
    });

    this.scheduler.register({
      name: 'diary.weekly-summary',
      cron: '0 20 * * 0',
      handler: () => this.sendWeeklySummaries(),
    });
  }

  async sendWeeklySummaries(): Promise<void> {
    for (const userId of await this.diary.usersWithWeeklySummary()) {
      try {
        const summary = await this.summaries.summarize(userId, this.diary.lastWeek());
        if (!summary) {
          continue;
        }
        const user = await this.users.findById(userId);
        await this.notifications.send(userId, {
          title: diaryMessages(user?.locale ?? 'ru').weeklyTitle,
          body: summary,
          source: 'diary',
        });
      } catch (error) {
        // Например, AI не настроен — пропускаем пользователя, остальным отправляем.
        this.logger.warn(`Weekly diary summary failed for ${userId}: ${error}`);
      }
    }
  }

  async remind(): Promise<void> {
    for (const userId of await this.diary.usersToRemind()) {
      const user = await this.users.findById(userId);
      const text = diaryMessages(user?.locale ?? 'ru');
      await this.notifications.send(userId, {
        title: text.reminderTitle,
        body: text.reminderBody,
        source: 'diary',
      });
    }
  }
}
