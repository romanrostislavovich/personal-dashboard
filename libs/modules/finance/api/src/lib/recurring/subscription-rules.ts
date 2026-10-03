import { LocalDate, SubscriptionSuggestion } from '@pd/contracts';

export interface ExpenseRow {
  note: string | null;
  amount: number;
  currency: string;
  category: string;
  occurredOn: LocalDate;
  /** Set when a recurring payment made it: such rows are its own charges. */
  recurringPaymentId: string | null;
}

/** A subscription costs about the same each month: a shop does not. */
const MAX_PRICE_SPREAD = 1.15;
/** Charged on about the same day of the month. */
const MAX_DAY_SPREAD = 5;
/** Still being charged: the last charge is this recent. */
const STILL_ACTIVE_DAYS = 45;
/** A price seen in the bank this much above the recorded one is a rise, not rounding. */
const RISE = 1.005;
/** The reminder about a free trial comes this many days before it ends. */
const TRIAL_NOTICE_DAYS = 3;

/** What a charge is recognised by: its note, without case and extra spaces. */
export function chargeKey(note: string | null): string {
  return (note ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Charges that look like subscriptions: the same note, once a month for at least two months,
 * at about the same price and day, the last one recent. Known payments and dismissed ones are
 * left out.
 */
export function suggestSubscriptions(
  rows: ExpenseRow[],
  today: LocalDate,
  known: string[],
  dismissed: Set<string>,
): SubscriptionSuggestion[] {
  const knownKeys = known.map(chargeKey).filter(Boolean);
  const groups = new Map<string, ExpenseRow[]>();
  for (const row of rows) {
    const key = chargeKey(row.note);
    if (!key || row.recurringPaymentId) {
      continue;
    }
    const group = `${key}\u0000${row.currency}`;
    groups.set(group, [...(groups.get(group) ?? []), row]);
  }

  const suggestions: SubscriptionSuggestion[] = [];
  for (const charges of groups.values()) {
    const key = chargeKey(charges[0].note);
    if (dismissed.has(key) || knownKeys.some((name) => key.includes(name) || name.includes(key))) {
      continue;
    }
    const months = [...new Set(charges.map((charge) => charge.occurredOn.slice(0, 7)))].sort();
    const amounts = charges.map((charge) => charge.amount);
    const days = charges.map((charge) => Number(charge.occurredOn.slice(8, 10)));
    const last = [...charges].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn)).at(-1);
    if (
      !last ||
      months.length < 2 ||
      charges.length !== months.length ||
      Math.max(...amounts) > Math.min(...amounts) * MAX_PRICE_SPREAD ||
      Math.max(...days) - Math.min(...days) > MAX_DAY_SPREAD ||
      daysBetween(last.occurredOn, today) > STILL_ACTIVE_DAYS
    ) {
      continue;
    }
    suggestions.push({
      key,
      name: (last.note ?? '').trim(),
      amount: last.amount,
      currency: last.currency,
      category: last.category,
      dayOfMonth: Number(last.occurredOn.slice(8, 10)),
      months,
    });
  }
  return suggestions.sort(
    (a, b) => b.months.length - a.months.length || a.key.localeCompare(b.key),
  );
}

export interface WatchedPayment {
  id: string;
  name: string;
  amount: number;
  currency: string;
  isActive: boolean;
  noticedAmount: number | null;
}

/** Recorded payments the bank charged more for than recorded, not reported yet. */
export function priceRises(
  payments: WatchedPayment[],
  rows: ExpenseRow[],
): { payment: WatchedPayment; amount: number }[] {
  return payments.flatMap((payment) => {
    const name = chargeKey(payment.name);
    if (!payment.isActive || !name) {
      return [];
    }
    const seen = rows
      .filter(
        (row) =>
          !row.recurringPaymentId &&
          row.currency === payment.currency &&
          chargeKey(row.note).includes(name),
      )
      .map((row) => row.amount);
    const highest = seen.length ? Math.max(...seen) : 0;
    return highest > payment.amount * RISE && highest !== payment.noticedAmount
      ? [{ payment, amount: highest }]
      : [];
  });
}

/** Active payments whose free trial ends within a few days and was not reminded of yet. */
export function trialsEnding<
  T extends {
    isActive: boolean;
    trialEndsOn: LocalDate | null;
    trialNotifiedFor: LocalDate | null;
  },
>(payments: T[], today: LocalDate): T[] {
  return payments.filter(
    (payment) =>
      payment.isActive &&
      payment.trialEndsOn !== null &&
      payment.trialEndsOn >= today &&
      daysBetween(today, payment.trialEndsOn) <= TRIAL_NOTICE_DAYS &&
      payment.trialNotifiedFor !== payment.trialEndsOn,
  );
}

function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
