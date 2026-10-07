import { Injectable, OnModuleInit } from '@nestjs/common';
import { LinksService } from '@pd/api-core';
import { ProjectFact } from '@pd/contracts';
import { TransactionsService } from './transactions/transactions.service';

/**
 * What finance tells the other sections (see LinksService): the money of a project for its
 * overview, and the money spent on every day (what goes with a good or a bad day).
 */
@Injectable()
export class FinanceLinks implements OnModuleInit {
  constructor(
    private readonly links: LinksService,
    private readonly transactions: TransactionsService,
  ) {}

  onModuleInit(): void {
    this.links.registerProject({
      module: 'finance',
      facts: async (userId, project, period): Promise<ProjectFact[]> => {
        const { inMain } = await this.transactions.summary(userId, {
          ...period,
          scope: project.id,
        });
        if (!inMain || (!inMain.income && !inMain.expense)) {
          return [];
        }
        const money = { module: 'finance', unit: 'money', currency: inMain.mainCurrency } as const;
        return [
          {
            ...money,
            labelKey: 'finance.links.income',
            value: inMain.income,
            metric: 'income',
            link: '/finance',
          },
          {
            ...money,
            labelKey: 'finance.links.expense',
            value: inMain.expense,
            metric: 'expense',
            link: '/finance',
            note: inMain.topExpenseCategories
              .slice(0, 3)
              .map((item) => item.category)
              .join(', '),
          },
        ];
      },
    });

    this.links.registerDailyMetrics({
      module: 'finance',
      metrics: async (userId, period) => {
        const { mainCurrency, byDay } = await this.transactions.expensesByDayInMain(userId, period);
        return byDay.size
          ? [
              {
                key: 'finance.spent',
                module: 'finance',
                labelKey: 'finance.links.spent',
                unit: 'money',
                currency: mainCurrency,
                days: [...byDay].map(([day, value]) => ({ day, value })),
              },
            ]
          : [];
      },
    });

    this.links.registerPages([
      { module: 'finance', path: '/finance', description: 'money: overview, transactions' },
      { module: 'finance', path: '/finance?tab=goals', description: 'savings goals' },
      { module: 'finance', path: '/finance?tab=wishlist', description: 'wishlist with prices' },
    ]);
  }
}
