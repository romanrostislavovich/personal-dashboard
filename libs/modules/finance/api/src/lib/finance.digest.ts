import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService, UsersService } from '@pd/api-core';
import { zonedDateTime } from '@pd/contracts';
import { BudgetsService } from './budgets/budgets.service';
import { RecurringPaymentsService } from './recurring/recurring-payments.service';

/** The morning digest: recurring payments charged, added or changed, and the budgets of the month. */
@Injectable()
export class FinanceDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly recurring: RecurringPaymentsService,
    private readonly budgets: BudgetsService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'finance.budgets',
      module: 'finance',
      description:
        'Budgets of this month: `category` (`*` — all expenses), `limit`, `spent`, `currency`, ' +
        'and how many days are left in the month. Mention only the ones past 80% or spent, ' +
        'and how much is left a day for the rest of the month.',
      collect: async (userId) => {
        const today = zonedDateTime(
          new Date(),
          this.users.timeZoneOf(await this.users.findById(userId)),
        ).date;
        const budgets = await this.budgets.list(userId, today.slice(0, 7));
        if (!budgets.length) {
          return null;
        }
        const [year, month, day] = today.split('-').map(Number);
        const daysLeft = new Date(Date.UTC(year, month, 0)).getUTCDate() - day + 1;
        return {
          daysLeft,
          budgets: budgets.map(({ category, limit, spent, currency }) => ({
            category,
            limit,
            spent,
            currency,
          })),
        };
      },
    });
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
