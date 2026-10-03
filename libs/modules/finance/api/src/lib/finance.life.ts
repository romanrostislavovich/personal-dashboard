import { Injectable, OnModuleInit } from '@nestjs/common';
import { LifeService, UsersService } from '@pd/api-core';
import { LifeCard, LifeEvent } from '@pd/contracts';
import { financeMessages } from './finance.messages';
import { FinanceReportsService } from './reports/finance-reports.service';
import { TransactionsService } from './transactions/transactions.service';

/**
 * Finance in the life timeline (the money of a day), in the summaries (spent, earned) and in the
 * message about a month (the short version of the AI's review).
 */
@Injectable()
export class FinanceLife implements OnModuleInit {
  constructor(
    private readonly life: LifeService,
    private readonly transactions: TransactionsService,
    private readonly reports: FinanceReportsService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.life.register({
      module: 'finance',
      monthNote: async (userId, month) => {
        const summary = await this.reports.summaryOf(userId, month);
        const locale = (await this.users.findById(userId))?.locale ?? 'en';
        return summary ? financeMessages(locale).reportNote(summary) : null;
      },
      day: async (userId, day): Promise<LifeEvent[]> => {
        const summary = await this.transactions.summary(userId, { from: day, to: day });
        const main = summary.inMain;
        if (!main || (!main.expense && !main.income)) {
          return [];
        }
        const top = main.topExpenseCategories[0]?.category ?? '';
        return [
          ...(main.expense
            ? [
                {
                  module: 'finance',
                  icon: 'payments',
                  key: 'finance.life.spent',
                  params: { amount: main.expense.toFixed(2), currency: main.mainCurrency, top },
                  at: null,
                  link: '/finance',
                },
              ]
            : []),
          ...(main.income
            ? [
                {
                  module: 'finance',
                  icon: 'savings',
                  key: 'finance.life.earned',
                  params: { amount: main.income.toFixed(2), currency: main.mainCurrency },
                  at: null,
                  link: '/finance',
                },
              ]
            : []),
        ];
      },
      period: async (userId, period): Promise<LifeCard[]> => {
        const main = (await this.transactions.summary(userId, period)).inMain;
        if (!main) {
          return [];
        }
        const top = main.topExpenseCategories[0];
        return [
          {
            module: 'finance',
            icon: 'payments',
            key: 'finance.life.spentTotal',
            value: main.expense,
            format: 'money',
            currency: main.mainCurrency,
            ...(top
              ? { detailKey: 'finance.life.topCategory', detailParams: { category: top.category } }
              : {}),
          },
          {
            module: 'finance',
            icon: 'savings',
            key: 'finance.life.earnedTotal',
            value: main.income,
            format: 'money',
            currency: main.mainCurrency,
          },
        ];
      },
    });
  }
}
