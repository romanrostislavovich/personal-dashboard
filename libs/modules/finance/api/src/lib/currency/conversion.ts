import { addDays, LocalDate, parseLocalDate, toLocalDate } from '@pd/contracts';

/** Units of a currency per 1 EUR, by day — the shape of ECB rates. */
export type DailyRates = Map<LocalDate, Record<string, number>>;

export interface Amount {
  amount: number;
  currency: string;
  day: LocalDate;
}

export interface Converted {
  /** Per amount, in the main currency; `null` — no rate. */
  values: (number | null)[];
  /** Converted at today's rate, not the day's (the ECB does not publish them). */
  approximate: string[];
  missing: string[];
}

/**
 * The rate of `currency` on `day`: that day's, or the last published before it (no rates on
 * weekends and holidays). EUR is the base, always 1.
 */
export function rateOn(rates: DailyRates, currency: string, day: LocalDate): number | null {
  if (currency === 'EUR') {
    return 1;
  }
  let best: { day: LocalDate; rate: number } | null = null;
  for (const [date, values] of rates) {
    const rate = values[currency];
    if (rate !== undefined && date <= day && (!best || date > best.day)) {
      best = { day: date, rate };
    }
  }
  // A day before the fetched range still gets the earliest rate rather than nothing.
  if (!best) {
    for (const [date, values] of rates) {
      const rate = values[currency];
      if (rate !== undefined && (!best || date < best.day)) {
        best = { day: date, rate };
      }
    }
  }
  return best?.rate ?? null;
}

/**
 * Converts amounts into `main`: through EUR, at the rate of each amount's day (`daily`), or at
 * today's rate (`latest`) for a currency the daily rates lack.
 */
export function convertAll(
  amounts: Amount[],
  main: string,
  daily: DailyRates,
  latest: Record<string, number>,
): Converted {
  const approximate = new Set<string>();
  const missing = new Set<string>();
  const rate = (currency: string, day: LocalDate): number | null => {
    const exact = rateOn(daily, currency, day);
    if (exact !== null) {
      return exact;
    }
    const today = currency === 'EUR' ? 1 : latest[currency];
    if (today !== undefined) {
      approximate.add(currency);
      return today;
    }
    missing.add(currency);
    return null;
  };
  const values = amounts.map(({ amount, currency, day }) => {
    if (currency === main) {
      return amount;
    }
    const from = rate(currency, day);
    const to = rate(main, day);
    return from === null || to === null ? null : round((amount / from) * to);
  });
  return { values, approximate: [...approximate].sort(), missing: [...missing].sort() };
}

/** The range of days to fetch for these amounts: a week before the first covers a holiday. */
export function rateRange(amounts: Amount[]): { from: LocalDate; to: LocalDate } | null {
  if (amounts.length === 0) {
    return null;
  }
  const days = amounts.map((a) => a.day).sort();
  return { from: toLocalDate(addDays(parseLocalDate(days[0]), -7)), to: days[days.length - 1] };
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}
