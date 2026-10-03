import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, NotificationsService, UsersService } from '@pd/api-core';
import { addDays, parseLocalDate, Subscriptions, toLocalDate } from '@pd/contracts';
import { and, eq, gte } from 'drizzle-orm';
import { round } from '../currency/conversion';
import { ExchangeRatesService } from '../currency/exchange-rates.service';
import { FinanceSettingsService } from '../currency/finance-settings.service';
import { financeMessages } from '../finance.messages';
import { subscriptionDismissals, transactions } from '../finance.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { RecurringPaymentsService } from './recurring-payments.service';
import { ExpenseRow, priceRises, suggestSubscriptions, trialsEnding } from './subscription-rules';

/** How far back repeating charges are looked for. */
const SUGGEST_DAYS = 200;
/** How far back a higher price in the bank counts. */
const PRICE_DAYS = 40;

/**
 * The recurring payments seen as subscriptions: their cost together, charges that look like
 * subscriptions not recorded yet, a higher price in the bank, the end of a free trial.
 */
@Injectable()
export class SubscriptionsService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly recurring: RecurringPaymentsService,
    private readonly transactions: TransactionsService,
    private readonly rates: ExchangeRatesService,
    private readonly settings: FinanceSettingsService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    // An imported statement may show a subscription at a new price.
    this.transactions.onChange((userId) => this.checkPrices(userId));
  }

  async summary(userId: string): Promise<Subscriptions> {
    const today = toLocalDate(this.recurring.today());
    const payments = (await this.recurring.list(userId)).filter((payment) => payment.isActive);
    const main = await this.settings.mainCurrency(userId);
    const { values } = await this.rates.convert(
      payments.map((payment) => ({
        amount: payment.period === 'year' ? payment.amount / 12 : payment.amount,
        currency: payment.currency,
        day: today,
      })),
      main,
    );
    const perMonth = values.reduce<number>((total, value) => total + (value ?? 0), 0);
    const dismissed = await this.db
      .select({ key: subscriptionDismissals.key })
      .from(subscriptionDismissals)
      .where(eq(subscriptionDismissals.userId, userId));
    return {
      currency: main,
      perMonth: round(perMonth),
      perYear: round(perMonth * 12),
      suggestions: suggestSubscriptions(
        await this.expenses(userId, SUGGEST_DAYS),
        today,
        (await this.recurring.list(userId)).map((payment) => payment.name),
        new Set(dismissed.map((row) => row.key)),
      ),
    };
  }

  /** "Not a subscription": the charge is not suggested again. */
  async dismiss(userId: string, key: string): Promise<void> {
    await this.db
      .insert(subscriptionDismissals)
      .values({ userId, key: key.toLowerCase() })
      .onConflictDoNothing();
  }

  /** Tells about a recorded subscription the bank charged more for, once per price. */
  async checkPrices(userId: string): Promise<void> {
    const rows = await this.recurring.rows(userId);
    if (!rows.length) {
      return;
    }
    const rises = priceRises(rows, await this.expenses(userId, PRICE_DAYS));
    if (!rises.length) {
      return;
    }
    const text = financeMessages((await this.users.findById(userId))?.locale ?? 'en');
    for (const { payment, amount } of rises) {
      await this.notifications.send(userId, {
        title: text.priceRiseTitle(payment.name),
        body: text.priceRiseBody(payment.amount, amount, payment.currency),
        source: 'finance',
      });
      await this.recurring.markNoticed(payment.id, { noticedAmount: amount });
    }
  }

  /** A few days before a free trial ends: cancel it now, or it will be charged. */
  async remindTrials(userId: string): Promise<void> {
    const due = trialsEnding(
      await this.recurring.rows(userId),
      toLocalDate(this.recurring.today()),
    );
    if (!due.length) {
      return;
    }
    const text = financeMessages((await this.users.findById(userId))?.locale ?? 'en');
    for (const row of due) {
      const ends = row.trialEndsOn as string;
      await this.notifications.send(userId, {
        title: text.trialTitle(row.name),
        body: text.trialBody(ends, row.amount, row.currency),
        source: 'finance',
      });
      await this.recurring.markNoticed(row.id, { trialNotifiedFor: ends });
    }
  }

  private async expenses(userId: string, days: number): Promise<ExpenseRow[]> {
    const since = toLocalDate(addDays(parseLocalDate(toLocalDate(this.recurring.today())), -days));
    return this.db
      .select({
        note: transactions.note,
        amount: transactions.amount,
        currency: transactions.currency,
        category: transactions.category,
        occurredOn: transactions.occurredOn,
        recurringPaymentId: transactions.recurringPaymentId,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.kind, 'expense'),
          gte(transactions.occurredOn, since),
        ),
      );
  }
}
