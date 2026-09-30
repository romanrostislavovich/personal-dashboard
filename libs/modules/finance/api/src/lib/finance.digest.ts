import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { RecurringPaymentsService } from './recurring/recurring-payments.service';

/** Recurring payments in the morning digest: which were charged, added or changed. */
@Injectable()
export class FinanceDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly recurring: RecurringPaymentsService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'finance.recurring',
      module: 'finance',
      description:
        'Active recurring payments: name, amount, currency, day of month, the date last charged. ' +
        'Tell which were charged since the previous digest (a newer `lastChargedOn`), ' +
        'added, changed or stopped.',
      // Monthly spending totals are left out: imported costs change them every day.
      collect: async (userId) =>
        (await this.recurring.list(userId))
          .filter((payment) => payment.isActive)
          .map(({ name, amount, currency, dayOfMonth, lastChargedOn }) => ({
            name,
            amount,
            currency,
            dayOfMonth,
            lastChargedOn,
          })),
    });
  }
}
