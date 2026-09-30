import { Inject, Injectable } from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import { FinanceSettings, FinanceSettingsInput } from '@pd/contracts';
import { count, desc, eq } from 'drizzle-orm';
import { financeSettings, transactions } from '../finance.schema';
import { ExchangeRatesService } from './exchange-rates.service';

/** Without transactions and a choice, totals are shown in euros. */
const FALLBACK_CURRENCY = 'EUR';

/** The main currency: everything is converted into it for totals, charts and the AI. */
@Injectable()
export class FinanceSettingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rates: ExchangeRatesService,
  ) {}

  async get(userId: string): Promise<FinanceSettings> {
    const [row] = await this.db
      .select()
      .from(financeSettings)
      .where(eq(financeSettings.userId, userId));
    return {
      mainCurrency: row?.mainCurrency ?? null,
      effectiveMainCurrency: row?.mainCurrency ?? (await this.mostUsed(userId)),
      supportedCurrencies: await this.rates.supportedCurrencies(),
    };
  }

  async save(userId: string, input: FinanceSettingsInput): Promise<FinanceSettings> {
    await this.db
      .insert(financeSettings)
      .values({ userId, ...input })
      .onConflictDoUpdate({ target: financeSettings.userId, set: input });
    return this.get(userId);
  }

  async mainCurrency(userId: string): Promise<string> {
    return (await this.get(userId)).effectiveMainCurrency;
  }

  private async mostUsed(userId: string): Promise<string> {
    const [row] = await this.db
      .select({ currency: transactions.currency, uses: count() })
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .groupBy(transactions.currency)
      .orderBy(desc(count()))
      .limit(1);
    return row?.currency ?? FALLBACK_CURRENCY;
  }
}
