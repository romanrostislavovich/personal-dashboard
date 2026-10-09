import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, DemoContext, DemoService } from '@pd/api-core';
import { BUDGET_TOTAL } from '@pd/contracts';
import {
  financeBudgets,
  goalContributions,
  recurringPayments,
  savingsGoals,
  transactions,
  wishes,
  wishPrices,
} from './finance.schema';

const EUR = 'EUR';
/** A month of personal expenses: amount, category, days ago, note. */
const EXPENSES: [number, string, number, string][] = [
  [950, 'Rent', 7, 'Flat'],
  [64.3, 'Groceries', 0, 'Supermarket'],
  [41.9, 'Groceries', 2, 'Market'],
  [57.2, 'Groceries', 5, 'Supermarket'],
  [23.5, 'Eating out', 1, 'Lunch'],
  [46, 'Eating out', 4, 'Dinner with friends'],
  [49, 'Transport', 6, 'Monthly pass'],
  [89, 'Health', 3, 'Dentist'],
  [15.99, 'Subscriptions', 2, 'Spotify Premium'],
  [35, 'Sport', 6, 'Gym'],
  [72.4, 'Clothes', 4, 'Jacket'],
];

/** The demo data of Finance: a month of money, budgets, subscriptions, a goal, a wishlist. */
@Injectable()
export class FinanceDemo implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly demo: DemoService,
  ) {}

  onModuleInit(): void {
    this.demo.register({ module: 'finance', seed: (context) => this.seed(context) });
  }

  private async seed({ userId, daysAgo, projects }: DemoContext): Promise<void> {
    const money = { userId, currency: EUR };
    await this.db.insert(transactions).values([
      {
        ...money,
        kind: 'income',
        amount: 4200,
        category: 'Salary',
        note: 'Salary',
        occurredOn: daysAgo(8),
      },
      // Three months of the side project: its page shows them month by month.
      ...[3, 34, 65].flatMap((days, index) => [
        {
          ...money,
          projectId: projects.shop,
          kind: 'income' as const,
          amount: 640 - index * 90,
          category: 'Sales',
          note: 'Orders',
          occurredOn: daysAgo(days),
        },
        {
          ...money,
          projectId: projects.shop,
          kind: 'expense' as const,
          amount: 38,
          category: 'Hosting',
          note: 'Server',
          occurredOn: daysAgo(days + 2),
        },
      ]),
      ...EXPENSES.map(([amount, category, days, note]) => ({
        ...money,
        kind: 'expense' as const,
        amount,
        category,
        note,
        occurredOn: daysAgo(days),
      })),
    ]);

    await this.db.insert(financeBudgets).values([
      { userId, category: BUDGET_TOTAL, limit: 2200 },
      { userId, category: 'Groceries', limit: 400 },
      { userId, category: 'Eating out', limit: 150 },
    ]);

    const subscription = { ...money, isActive: true, period: 'month' as const };
    await this.db.insert(recurringPayments).values([
      {
        ...subscription,
        name: 'Spotify Premium',
        amount: 15.99,
        category: 'Subscriptions',
        dayOfMonth: 12,
      },
      { ...subscription, name: 'Gym', amount: 35, category: 'Sport', dayOfMonth: 3 },
      {
        ...subscription,
        name: 'Hetzner server',
        amount: 38,
        category: 'Hosting',
        dayOfMonth: 1,
        projectId: projects.shop,
      },
    ]);

    const [goal] = await this.db
      .insert(savingsGoals)
      .values({ ...money, name: 'A new watch', target: 400, startedOn: daysAgo(120) })
      .returning();
    await this.db
      .insert(goalContributions)
      .values({ userId, goalId: goal.id, amount: 310, occurredOn: daysAgo(10) });

    const wish = { userId, currency: EUR, checkedAt: new Date() };
    const [watch] = await this.db
      .insert(wishes)
      .values([
        {
          ...wish,
          url: 'https://shop.example.com/watch',
          name: 'Garmin Forerunner 265',
          price: 399,
          previousPrice: 449,
          goalId: goal.id,
        },
        {
          ...wish,
          url: 'https://shop.example.com/headphones',
          name: 'Sony WH-1000XM5',
          price: 289,
          previousPrice: 279,
        },
        // A gift idea: it shows at the person's birthday.
        {
          ...wish,
          url: 'https://shop.example.com/teapot',
          name: 'Cast iron teapot',
          price: 54,
          recipient: 'Mia',
        },
      ])
      .returning();
    // The price of a month, so the wish has a chart.
    await this.db.insert(wishPrices).values(
      [30, 22, 15, 8, 0].map((days, index) => ({
        userId,
        wishId: watch.id,
        day: daysAgo(days),
        price: [449, 449, 429, 449, 399][index],
        currency: EUR,
      })),
    );
  }
}
