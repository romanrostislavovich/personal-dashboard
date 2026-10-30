import {LocalDate, WorthItem, WorthPoint} from '@pd/contracts';

/** The burn rate is the average of this many last full months. */
export const BURN_MONTHS = 3;

/** Everything owned minus the debts, and the money at hand, of items already in the main currency. */
export function totals(items: WorthItem[]): {total: number; liquid: number} {
  let total = 0;
  let liquid = 0;
  for (const item of items) {
    if (item.inMain === null) {
      continue;
    }
    total += item.inMain;
    // A debt lowers the worth, but the money at hand is still at hand.
    if (item.liquid && item.inMain > 0) {
      liquid += item.inMain;
    }
  }
  return {total: round(total), liquid: round(liquid)};
}

/** The full months the burn rate is counted over: the last `count` before `today`'s month. */
export function burnPeriod(
  today: LocalDate,
  count = BURN_MONTHS,
): {from: LocalDate; to: LocalDate} {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const start = new Date(Date.UTC(year, month - 1 - count, 1));
  const end = new Date(Date.UTC(year, month - 1, 0));
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

/**
 * The average expenses of a month over the months that have any (a new user with one month
 * of data is not averaged over three), and how many months that is.
 */
export function burnRate(byDay: Map<LocalDate, number>): {
  perMonth: number;
  months: number;
} {
  const byMonth = new Map<string, number>();
  for (const [day, amount] of byDay) {
    byMonth.set(day.slice(0, 7), (byMonth.get(day.slice(0, 7)) ?? 0) + amount);
  }
  const months = [...byMonth.values()].filter(amount => amount > 0);
  if (!months.length) {
    return {perMonth: 0, months: 0};
  }
  return {
    perMonth: round(
      months.reduce((sum, amount) => sum + amount, 0) / months.length,
    ),
    months: months.length,
  };
}

/** How many months the money at hand lasts if nothing comes in; `null` — nothing is spent. */
export function runway(liquid: number, burnPerMonth: number): number | null {
  if (burnPerMonth <= 0) {
    return null;
  }
  return Math.round((Math.max(0, liquid) / burnPerMonth) * 10) / 10;
}

/** The total of the newest point at least 30 days old. */
export function monthAgo(
  history: WorthPoint[],
  today: LocalDate,
): number | null {
  const limit = new Date(Date.parse(today) - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const older = history.filter(point => point.day <= limit);
  return older.length ? older[older.length - 1].total : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
