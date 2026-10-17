import { Injectable, OnModuleInit } from '@nestjs/common';
import { LinksService } from '@pd/api-core';
import { ProjectFact } from '@pd/contracts';
import { TransactionsService } from './transactions/transactions.service';
import { WishlistService } from './wishlist/wishlist.service';

/** The categories of spending that get a daily number of their own, and the days one needs. */
const CATEGORIES = 8;
const CATEGORY_MIN_DAYS = 10;

/**
 * What finance tells the other sections (see LinksService): the money of a project for its
 * overview, the money spent on every day (what goes with a good or a bad day), and the wishes
 * that are a gift for somebody — the gift ideas of a birthday.
 */
@Injectable()
export class FinanceLinks implements OnModuleInit {
  constructor(
    private readonly links: LinksService,
    private readonly transactions: TransactionsService,
    private readonly wishlist: WishlistService,
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
        const { mainCurrency, byDay, byCategory } = await this.transactions.expensesByDayInMain(
          userId,
          period,
        );
        if (!byDay.size) {
          return [];
        }
        // The categories spent on most often: a rare one has too few days to compare.
        const categories = [...byCategory]
          .filter(([, days]) => days.size >= CATEGORY_MIN_DAYS)
          .sort((a, b) => b[1].size - a[1].size)
          .slice(0, CATEGORIES);
        return [
          {
            key: 'finance.spent',
            module: 'finance',
            labelKey: 'finance.links.spent',
            unit: 'money',
            currency: mainCurrency,
            days: [...byDay].map(([day, value]) => ({ day, value })),
          },
          ...categories.map(([category, days]) => ({
            key: `finance.spent.${category.toLowerCase()}`,
            module: 'finance',
            labelKey: 'finance.links.spentOn',
            label: category,
            unit: 'money' as const,
            currency: mainCurrency,
            partOf: 'finance.spent',
            // From the first day of all the spending: a day without this category is a zero.
            days: [...byDay.keys()].map((day) => ({ day, value: days.get(day) ?? 0 })),
          })),
        ];
      },
    });

    this.links.registerPeople({
      module: 'finance',
      about: async (userId, names) => {
        const ideas = await this.wishlist.giftIdeas(userId, names);
        return new Map(
          [...ideas].map(([name, wishes]) => [
            name,
            wishes.map((wish) => ({
              kind: 'gift',
              title: wish.name,
              detail:
                wish.price !== null && wish.currency
                  ? `${wish.price.toFixed(2)} ${wish.currency}`
                  : null,
              link: wish.url,
            })),
          ]),
        );
      },
    });

    this.links.registerPages([
      { module: 'finance', path: '/finance', description: 'money: overview, transactions' },
      { module: 'finance', path: '/finance?tab=goals', description: 'savings goals' },
      { module: 'finance', path: '/finance?tab=wishlist', description: 'wishlist with prices' },
    ]);
  }
}
