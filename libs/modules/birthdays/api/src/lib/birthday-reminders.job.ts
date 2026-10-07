import { Injectable, OnModuleInit } from '@nestjs/common';
import { NotificationsService, SchedulerService, UsersService } from '@pd/api-core';
import { birthdayMessages } from './birthdays.messages';
import { BirthdaysService } from './birthdays.service';
import { dueReminders } from './due-reminders';

/** Every morning sends reminders about upcoming birthdays and days of memory. */
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
      for (const { kind, person } of dueReminders(await this.birthdays.list(user.id))) {
        const message =
          kind === 'birthday'
            ? {
                title: text.title,
                body: person.daysUntil === 0 ? text.today(person) : text.soon(person),
              }
            : kind === 'birthday-in-memory'
              ? { title: text.inMemoryTitle, body: text.inMemory(person) }
              : {
                  title: text.memorialTitle,
                  body:
                    person.memorial?.daysUntil === 0
                      ? text.memorialToday(person)
                      : text.memorialSoon(person),
                };
        await this.notifications.send(user.id, { ...message, source: 'birthdays' });
      }
    }
  }
}
