import { Injectable, OnModuleInit } from '@nestjs/common';
import { NotificationsService, SchedulerService, UsersService } from '@pd/api-core';
import { birthdayMessages } from './birthdays.messages';
import { BirthdaysService } from './birthdays.service';

/** Каждое утро присылает напоминания о ближайших днях рождения. */
@Injectable()
export class BirthdayRemindersJob implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly users: UsersService,
    private readonly birthdays: BirthdaysService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'birthdays.daily-reminders',
      cron: '0 9 * * *',
      handler: () => this.run(),
    });
  }

  async run(): Promise<void> {
    for (const user of await this.users.findAll()) {
      const text = birthdayMessages(user.locale);
      const due = (await this.birthdays.list(user.id)).filter((b) =>
        b.remindDaysBefore.includes(b.daysUntil),
      );

      for (const birthday of due) {
        await this.notifications.send(user.id, {
          title: text.title,
          body: birthday.daysUntil === 0 ? text.today(birthday) : text.soon(birthday),
          source: 'birthdays',
        });
      }
    }
  }
}
