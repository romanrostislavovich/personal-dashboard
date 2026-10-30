import {Injectable, OnModuleInit} from '@nestjs/common';
import {SchedulerService} from '@pd/api-core';
import {BankService} from './bank.service';

/**
 * The banks' operations every six hours (PSD2 lets an application ask a bank about four times
 * a day without the user), and the reminders to confirm a consent before it ends.
 */
@Injectable()
export class BankJob implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly bank: BankService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'finance.bank-sync',
      cron: '15 */6 * * *',
      // A bank may answer slowly: every account is a few requests.
      expireMinutes: 60,
      handler: () => this.bank.syncAll(),
    });
    this.scheduler.register({
      name: 'finance.bank-consent',
      cron: '0 10 * * *',
      handler: () => this.bank.remindExpiring(),
    });
  }
}
