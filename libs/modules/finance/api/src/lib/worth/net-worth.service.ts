import { Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DB, Database, forEachUser, SchedulerService, UsersService } from '@pd/api-core';
import { Asset, AssetInput, NetWorth, toLocalDate, WorthItem } from '@pd/contracts';
import { and, asc, eq, gte, isNotNull } from 'drizzle-orm';
import { bankAccounts } from '../bank/bank.schema';
import { ExchangeRatesService } from '../currency/exchange-rates.service';
import { FinanceSettingsService } from '../currency/finance-settings.service';
import { AssetRow, financeAssets, netWorthDays } from '../finance.schema';
import { RecurringPaymentsService } from '../recurring/recurring-payments.service';
import { TransactionsService } from '../transactions/transactions.service';
import { burnPeriod, burnRate, monthAgo, runway, totals } from './net-worth';

/** The history shown: a year of days. */
const HISTORY_DAYS = 366;

/**
 * Net worth and runway: the bank accounts (their balances come by themselves) and what is typed
 * in by hand, in the main currency; the average spending of a month and how long the money at
 * hand lasts at it. A point of the worth is kept every evening, so the history grows.
 */
@Injectable()
export class NetWorthService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rates: ExchangeRatesService,
    private readonly settings: FinanceSettingsService,
    private readonly transactions: TransactionsService,
    private readonly recurring: RecurringPaymentsService,
    private readonly scheduler: SchedulerService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'finance.net-worth',
      cron: '45 23 * * *',
      handler: async () =>
        forEachUser('finance.net-worth', await this.users.findAll(), (user) =>
          this.snapshot(user.id),
        ),
    });
  }

  async get(userId: string): Promise<NetWorth> {
    const today = this.today();
    const main = await this.settings.mainCurrency(userId);
    const items = await this.items(userId, main);
    const { total, liquid } = totals(items);
    const since = new Date(Date.parse(today) - HISTORY_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const stored = await this.db
      .select({ day: netWorthDays.day, total: netWorthDays.total })
      .from(netWorthDays)
      .where(
        and(
          eq(netWorthDays.userId, userId),
          eq(netWorthDays.currency, main),
          gte(netWorthDays.day, since),
        ),
      )
      .orderBy(asc(netWorthDays.day));
    // Today's point is the live one, not the one kept last evening.
    const history = [...stored.filter((point) => point.day < today), { day: today, total }];
    const burn = await this.burn(userId, today);
    return {
      currency: main,
      total,
      liquid,
      items,
      missing: [...new Set(items.filter((i) => i.inMain === null).map((i) => i.currency))],
      history: items.length ? history : [],
      monthAgo: monthAgo(stored, today),
      burnPerMonth: burn.perMonth,
      burnMonths: burn.months,
      runwayMonths: items.length ? runway(liquid, burn.perMonth) : null,
    };
  }

  /**
   * The average spending of a month over the last full months; with none yet (a new account,
   * a first statement), the last 30 days stand for a month (`months: 0`).
   */
  private async burn(userId: string, today: string): Promise<{ perMonth: number; months: number }> {
    const { byDay } = await this.transactions.expensesByDayInMain(userId, burnPeriod(today));
    const burn = burnRate(byDay);
    if (burn.months > 0) {
      return burn;
    }
    const from = new Date(Date.parse(today) - 29 * 86_400_000).toISOString().slice(0, 10);
    const recent = await this.transactions.expensesByDayInMain(userId, { from, to: today });
    const total = [...recent.byDay.values()].reduce((sum, amount) => sum + amount, 0);
    return { perMonth: Math.round(total * 100) / 100, months: 0 };
  }

  /** Keeps today's worth as a point of the history; nothing to keep without any item. */
  async snapshot(userId: string): Promise<void> {
    const main = await this.settings.mainCurrency(userId);
    const items = await this.items(userId, main);
    if (!items.length) {
      return;
    }
    const { total, liquid } = totals(items);
    const day = this.today();
    await this.db
      .insert(netWorthDays)
      .values({ userId, day, total, liquid, currency: main })
      .onConflictDoUpdate({
        target: [netWorthDays.userId, netWorthDays.day],
        set: { total, liquid, currency: main },
      });
  }

  async assets(userId: string): Promise<Asset[]> {
    const rows = await this.db
      .select()
      .from(financeAssets)
      .where(eq(financeAssets.userId, userId))
      .orderBy(asc(financeAssets.createdAt));
    return rows.map(toAsset);
  }

  async saveAsset(userId: string, input: AssetInput, id?: string): Promise<Asset> {
    const values = { ...input, updatedAt: new Date() };
    const [row] = id
      ? await this.db
          .update(financeAssets)
          .set(values)
          .where(and(eq(financeAssets.id, id), eq(financeAssets.userId, userId)))
          .returning()
      : await this.db
          .insert(financeAssets)
          .values({ userId, ...values })
          .returning();
    if (!row) {
      throw new NotFoundException();
    }
    return toAsset(row);
  }

  async removeAsset(userId: string, id: string): Promise<void> {
    await this.db
      .delete(financeAssets)
      .where(and(eq(financeAssets.id, id), eq(financeAssets.userId, userId)));
  }

  /** The bank accounts with a balance and the assets typed in, each in the main currency. */
  private async items(userId: string, main: string): Promise<WorthItem[]> {
    const accounts = await this.db
      .select()
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.userId, userId),
          eq(bankAccounts.enabled, true),
          isNotNull(bankAccounts.balance),
          isNotNull(bankAccounts.balanceCurrency),
        ),
      );
    const items: Omit<WorthItem, 'inMain'>[] = [
      ...accounts.map((account) => ({
        source: 'bank' as const,
        id: account.id,
        name: account.name ?? account.currency ?? 'Bank',
        kind: 'account' as const,
        amount: account.balance ?? 0,
        currency: account.balanceCurrency ?? main,
        liquid: true,
        at: account.balanceAt?.toISOString() ?? null,
      })),
      ...(await this.assets(userId)).map((asset) => ({
        source: 'manual' as const,
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        amount: asset.amount,
        currency: asset.currency,
        liquid: asset.liquid,
        at: asset.updatedAt,
      })),
    ];
    const day = this.today();
    const { values } = await this.rates.convert(
      items.map((item) => ({ amount: item.amount, currency: item.currency, day })),
      main,
    );
    return items.map((item, index) => {
      const value = values[index];
      const inMain = value === null ? null : Math.round(value * 100) / 100;
      return { ...item, inMain: inMain !== null && item.kind === 'debt' ? -inMain : inMain };
    });
  }

  private today(): string {
    return toLocalDate(this.recurring.today());
  }
}

function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    amount: row.amount,
    currency: row.currency,
    liquid: row.liquid,
    updatedAt: row.updatedAt.toISOString(),
  };
}
