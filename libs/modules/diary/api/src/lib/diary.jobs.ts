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
 * Connects the diary to the outside world:
 * - the bot command `/d text` appends a note to today's entry;
 * - at 21:00, a reminder for those who enabled it and have not written today;
 * - on Sundays at 20:00, an AI summary of the week (for those who enabled it).
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
    this.telegram.registerCommand({
      command: 'd',
      description: {
        en: diaryMessages('en').commandDescription,
        ru: diaryMessages('ru').commandDescription,
      },
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
          title: diaryMessages(user?.locale ?? 'en').weeklyTitle,
          body: summary,
          source: 'diary',
        });
      } catch (error) {
        // For example, the AI is not configured — skip this user, send to the rest.
        this.logger.warn(`Weekly diary summary failed for ${userId}: ${error}`);
      }
    }
  }

  async remind(): Promise<void> {
    for (const userId of await this.diary.usersToRemind()) {
      const user = await this.users.findById(userId);
      const text = diaryMessages(user?.locale ?? 'en');
      await this.notifications.send(userId, {
        title: text.reminderTitle,
        body: text.reminderBody,
        source: 'diary',
      });
    }
  }
}
