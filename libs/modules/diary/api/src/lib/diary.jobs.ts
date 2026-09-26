import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  NotificationsService,
  SchedulerService,
  TelegramBotService,
  UsersService,
} from '@pd/api-core';
import { diaryMessages } from './diary.messages';
import { DiaryService } from './diary.service';

/**
 * Связь дневника с внешним миром:
 * - команда бота `/d текст` дописывает заметку в сегодняшнюю запись;
 * - в 21:00 напоминание тем, кто включил его и ещё не писал сегодня.
 */
@Injectable()
export class DiaryJobs implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly telegram: TelegramBotService,
    private readonly users: UsersService,
    private readonly diary: DiaryService,
    private readonly notifications: NotificationsService,
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
