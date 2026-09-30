import { Injectable, Logger } from '@nestjs/common';
import { LocalDate } from '@pd/contracts';
import { Amount, Converted, convertAll, DailyRates, rateRange } from './conversion';

/** Frankfurter: ECB reference rates by day, no API key (frankfurter.dev). */
const FRANKFURTER = 'https://api.frankfurter.dev/v1';
/** ExchangeRate-API's open access: today's rates of ~160 currencies, no API key. */
const OPEN_ER_API = 'https://open.er-api.com/v6/latest/EUR';
const TIMEOUT_MS = 10_000;
/** Past rates never change; today's are refreshed a few times a day. */
const LATEST_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_LIMIT = 100;

/**
 * Exchange rates for converting into the main currency. The ECB's daily rates (the rate of the
 * transaction's day, as accounting does) for the ~30 currencies it publishes; today's rate for the
 * others. Nothing is stored: rates are fetched per range and kept in memory.
 */
@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private readonly daily = new Map<string, Promise<DailyRates>>();
  private supported: Promise<string[]> | null = null;
  private latest: { at: number; rates: Promise<Record<string, number>> } | null = null;

  async convert(amounts: Amount[], main: string): Promise<Converted> {
    const range = rateRange(amounts);
    if (!range) {
      return { values: [], approximate: [], missing: [] };
    }
    const supported = new Set(await this.supportedCurrencies());
    const currencies = new Set([main, ...amounts.map((a) => a.currency)]);
    currencies.delete('EUR');
    const exact = [...currencies].filter((c) => supported.has(c)).sort();
    const others = [...currencies].filter((c) => !supported.has(c));
    const [daily, latest] = await Promise.all([
      exact.length ? this.dailyRates(range.from, range.to, exact) : new Map(),
      others.length ? this.latestRates() : {},
    ]);
    return convertAll(amounts, main, daily, latest);
  }

  /** The currencies with daily ECB rates, EUR included. */
  supportedCurrencies(): Promise<string[]> {
    this.supported ??= this.get<Record<string, string>>(`${FRANKFURTER}/currencies`)
      .then((names) => Object.keys(names).sort())
      .catch((error) => {
        this.supported = null; // Try again next time.
        this.logger.warn(`Could not load the ECB currency list: ${error}`);
        return ['EUR'];
      });
    return this.supported;
  }

  private dailyRates(from: LocalDate, to: LocalDate, symbols: string[]): Promise<DailyRates> {
    const key = `${from}..${to}:${symbols.join(',')}`;
    let rates = this.daily.get(key);
    if (!rates) {
      rates = this.get<{ rates: Record<LocalDate, Record<string, number>> }>(
        `${FRANKFURTER}/${from}..${to}?base=EUR&symbols=${symbols.join(',')}`,
      )
        .then((body) => new Map(Object.entries(body.rates)) as DailyRates)
        .catch((error) => {
          this.daily.delete(key);
          this.logger.warn(`Could not load ECB rates ${key}: ${error}`);
          return new Map() as DailyRates;
        });
      if (this.daily.size >= CACHE_LIMIT) {
        this.daily.delete(this.daily.keys().next().value as string);
      }
      this.daily.set(key, rates);
    }
    return rates;
  }

  private latestRates(): Promise<Record<string, number>> {
    if (!this.latest || Date.now() - this.latest.at > LATEST_TTL_MS) {
      this.latest = {
        at: Date.now(),
        rates: this.get<{ rates: Record<string, number> }>(OPEN_ER_API)
          .then((body) => body.rates)
          .catch((error) => {
            this.latest = null;
            this.logger.warn(`Could not load today's rates: ${error}`);
            return {};
          }),
      };
    }
    return this.latest.rates;
  }

  private async get<T>(url: string): Promise<T> {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`${response.status} from ${url}`);
    }
    return (await response.json()) as T;
  }
}
