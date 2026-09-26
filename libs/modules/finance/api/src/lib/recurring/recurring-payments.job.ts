import { Injectable, OnModuleInit } from '@nestjs/common';
import { NotificationsService, SchedulerService, UsersService } from '@pd/api-core';
import { financeMessages } from '../finance.messages';
import { RecurringPaymentsService } from './recurring-payments.service';

/** Каждое утро проводит регулярные платежи, у которых наступил день списания. */
@Injectable()
export class RecurringPaymentsJob implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly users: UsersService,
    private readonly payments: RecurringPaymentsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'finance.recurring-payments',
      cron: '0 8 * * *',
      handler: () => this.run(),
    });
  }

  async run(): Promise<void> {
    for (const user of await this.users.findAll()) {
      const charged = await this.payments.chargeDue(user.id);
      if (charged.length === 0) {
        continue;
      }
      const text = financeMessages(user.locale);
      await this.notifications.send(user.id, {
        title: text.chargedTitle,
        body: text.chargedBody(charged),
        source: 'finance',
      });
    }
  }
}
