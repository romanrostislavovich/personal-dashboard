import {
  KeyDate,
  LocalDate,
  SubscriptionLeak,
  SubscriptionSuggestion,
} from '@pd/contracts';
import {chargeKey, ExpenseRow} from './subscription-rules';

/*
 * Where the money of the subscriptions leaks, from the transactions alone: a price that crept
 * up over the year, a charge taken twice in a month, a subscription not used, one never
 * recorded, and a renewal or a notice deadline near. Each leak has what it costs a year in its
 * own currency (`yearly`); the service turns that into the main one.
 */

export type FoundLeak = Omit<SubscriptionLeak, 'perYear'> & {yearly: number};

/** A rise smaller than this is rounding or a currency rate, not a new price. */
const RISE = 1.02;
/** More than this is another service under the same name, not the same price grown. */
const MAX_RISE = 2;
/** A charge still taken: the last one this recent. */
const STILL_ACTIVE_DAYS = 45;
/** The months a price is followed over. */
const RISE_MONTHS = 12;
/** A double charge is looked for in these last days. */
const DOUBLE_DAYS = 62;
/** Two charges this close in amount are the same charge twice. */
const SAME_AMOUNT = 1.15;
/** Renewals and notice deadlines this near are worth acting on. */
const RENEWAL_DAYS = 30;

export interface LeakPayment {
  id: string;
  name: string;
  amount: number;
  currency: string;
  period: 'month' | 'year';
  isActive: boolean;
  /** The earlier prices, the newest first. */
  priceHistory: {amount: number; changedOn: LocalDate}[];
}

export interface LeakInput {
  rows: ExpenseRow[];
  payments: LeakPayment[];
  /** Ids of the payments paid for and not used. */
  unused: string[];
  suggestions: SubscriptionSuggestion[];
  dates: KeyDate[];
  today: LocalDate;
}

export function findLeaks(input: LeakInput): FoundLeak[] {
  const leaks = [
    ...recordedRises(input.payments, input.today),
    ...chargeRises(input.rows, input.payments, input.today),
    ...doubleCharges(input.rows, input.today),
    ...unusedPayments(input.payments, input.unused),
    ...input.suggestions.map((s): FoundLeak => ({
      kind: 'hidden',
      name: s.name,
      paymentId: null,
      key: s.key,
      amount: s.amount,
      currency: s.currency,
      previous: null,
      date: null,
      yearly: s.amount * 12,
    })),
    ...renewals(input.dates, input.today),
  ];
  return leaks;
}

/** A recorded payment whose price was raised within the year: the history tells by how much. */
function recordedRises(payments: LeakPayment[], today: LocalDate): FoundLeak[] {
  const yearAgo = monthsBefore(today, RISE_MONTHS);
  return payments.flatMap(payment => {
    const changes = payment.priceHistory.filter(
      price => price.changedOn >= yearAgo,
    );
    const oldest = changes.at(-1);
    if (
      !payment.isActive ||
      !oldest ||
      payment.amount <= oldest.amount * RISE
    ) {
      return [];
    }
    const perCharge = payment.amount - oldest.amount;
    return [
      {
        kind: 'rising',
        name: payment.name,
        paymentId: payment.id,
        key: null,
        amount: payment.amount,
        currency: payment.currency,
        previous: oldest.amount,
        date: oldest.changedOn,
        yearly: payment.period === 'year' ? perCharge : perCharge * 12,
      },
    ];
  });
}

/**
 * A charge taken once a month whose price went up over the year, seen in the transactions (a
 * bank, a statement) and not recorded as a payment: 39.99 in March, 45.99 in October.
 */
function chargeRises(
  rows: ExpenseRow[],
  payments: LeakPayment[],
  today: LocalDate,
): FoundLeak[] {
  const since = monthsBefore(today, RISE_MONTHS);
  const known = payments
    .map(payment => chargeKey(payment.name))
    .filter(Boolean);
  const found: FoundLeak[] = [];
  for (const charges of monthly(rows.filter(row => row.occurredOn >= since))) {
    const key = chargeKey(charges[0].note);
    if (known.some(name => key.includes(name) || name.includes(key))) {
      continue;
    }
    const first = charges[0];
    const last = charges[charges.length - 1];
    if (
      charges.length < 3 ||
      daysBetween(last.occurredOn, today) > STILL_ACTIVE_DAYS ||
      last.amount <= first.amount * RISE ||
      last.amount > first.amount * MAX_RISE
    ) {
      continue;
    }
    found.push({
      kind: 'rising',
      name: (last.note ?? '').trim(),
      paymentId: null,
      key,
      amount: last.amount,
      currency: last.currency,
      previous: first.amount,
      date: first.occurredOn,
      yearly: (last.amount - first.amount) * 12,
    });
  }
  return found;
}

/**
 * The same charge twice in one month, when every other month it is taken once: a subscription
 * charged twice (a shop taken weekly is never "once a month", so it is not mistaken for one).
 */
function doubleCharges(rows: ExpenseRow[], today: LocalDate): FoundLeak[] {
  const recent = toDate(Date.parse(today) - DOUBLE_DAYS * 86_400_000);
  const found: FoundLeak[] = [];
  for (const charges of groups(rows)) {
    const byMonth = new Map<string, ExpenseRow[]>();
    for (const charge of charges) {
      const month = charge.occurredOn.slice(0, 7);
      byMonth.set(month, [...(byMonth.get(month) ?? []), charge]);
    }
    const months = [...byMonth.values()];
    const once = months.filter(month => month.length === 1);
    if (once.length < 2 || months.some(month => month.length > 2)) {
      continue;
    }
    for (const month of months.filter(one => one.length === 2)) {
      const [a, b] = month;
      const close =
        Math.max(a.amount, b.amount) <=
        Math.min(a.amount, b.amount) * SAME_AMOUNT;
      const usual = once.map(one => one[0].amount);
      const likeUsual = usual.some(
        amount =>
          Math.max(amount, a.amount) <=
          Math.min(amount, a.amount) * SAME_AMOUNT,
      );
      if (!close || !likeUsual || b.occurredOn < recent) {
        continue;
      }
      found.push({
        kind: 'double',
        name: (b.note ?? '').trim(),
        paymentId: null,
        key: chargeKey(b.note),
        amount: b.amount,
        currency: b.currency,
        previous: null,
        date: `${b.occurredOn.slice(0, 7)}-01`,
        // Taken once too many: the money to ask back, not a cost a year.
        yearly: b.amount,
      });
    }
  }
  return found;
}

function unusedPayments(
  payments: LeakPayment[],
  unused: string[],
): FoundLeak[] {
  return payments
    .filter(payment => payment.isActive && unused.includes(payment.id))
    .map(payment => ({
      kind: 'unused',
      name: payment.name,
      paymentId: payment.id,
      key: null,
      amount: payment.amount,
      currency: payment.currency,
      previous: null,
      date: null,
      yearly: payment.period === 'year' ? payment.amount : payment.amount * 12,
    }));
}

/** A yearly charge, a notice deadline or the end of a price lock within a month. */
function renewals(dates: KeyDate[], today: LocalDate): FoundLeak[] {
  const until = toDate(Date.parse(today) + RENEWAL_DAYS * 86_400_000);
  return dates
    .filter(
      date =>
        (date.kind === 'renewal' ||
          date.kind === 'cancel-by' ||
          date.kind === 'price-lock') &&
        date.date <= until,
    )
    .map(date => ({
      kind: 'renewal',
      name: date.name,
      paymentId: date.paymentId,
      key: date.kind,
      amount: date.amount,
      currency: date.currency,
      previous: null,
      date: date.date,
      // Nothing is lost yet: it is a date to act by.
      yearly: 0,
    }));
}

/** The charges of one note and currency, oldest first, not made by a recorded payment. */
function groups(rows: ExpenseRow[]): ExpenseRow[][] {
  const found = new Map<string, ExpenseRow[]>();
  for (const row of rows) {
    const key = chargeKey(row.note);
    if (!key || row.recurringPaymentId) {
      continue;
    }
    const group = `${key}\u0000${row.currency}`;
    found.set(group, [...(found.get(group) ?? []), row]);
  }
  return [...found.values()].map(charges =>
    charges.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn)),
  );
}

/** The groups charged once a month, month after month (a gap of a month at most). */
function monthly(rows: ExpenseRow[]): ExpenseRow[][] {
  return groups(rows).filter(charges => {
    const months = charges.map(charge => monthIndex(charge.occurredOn));
    return (
      new Set(months).size === months.length &&
      months.every((month, i) => i === 0 || month - months[i - 1] <= 2)
    );
  });
}

function monthIndex(date: LocalDate): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
}

function monthsBefore(date: LocalDate, months: number): LocalDate {
  const index = monthIndex(date) - months - 1;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function toDate(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10);
}
