import {
  addDays,
  ContractDates,
  daysInMonth,
  KeyDate,
  KeyDateKind,
  LocalDate,
  parseLocalDate,
  toLocalDate,
} from '@pd/contracts';

/** The terms of a payment's contract, as they are stored. */
export interface ContractTerms {
  contractStartedOn: LocalDate | null;
  contractMonths: number | null;
  noticeDays: number | null;
  autoRenews: boolean;
}

/** A term that renews itself is counted this many terms ahead at most (a lifetime). */
const MAX_TERMS = 1200;

/** `months` later; the 31st becomes the last day of a shorter month. */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const {year, month, day} = parseLocalDate(date);
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return toLocalDate({
    year: y,
    month: m,
    day: Math.min(day, daysInMonth(y, m)),
  });
}

function minusDays(date: LocalDate, days: number): LocalDate {
  return toLocalDate(addDays(parseLocalDate(date), -days));
}

/**
 * What the terms come to today: the end of the term running now and the last day to give
 * notice for it. The start, when not given, is the first charge seen (`firstCharge`). A term
 * that does not renew itself ends once — it stays the end even after it has passed.
 */
export function contractDates(
  terms: ContractTerms,
  firstCharge: LocalDate | null,
  today: LocalDate,
): ContractDates | null {
  const startedOn = terms.contractStartedOn ?? firstCharge;
  if (!terms.contractMonths || !startedOn) {
    return null;
  }
  let term = 1;
  if (terms.autoRenews) {
    while (
      term < MAX_TERMS &&
      addMonths(startedOn, term * terms.contractMonths) <= today
    ) {
      term++;
    }
  }
  const termEndsOn = addMonths(startedOn, term * terms.contractMonths);
  const cancelBy = minusDays(termEndsOn, terms.noticeDays ?? 0);
  return {
    startedOn,
    startGuessed: !terms.contractStartedOn,
    termEndsOn,
    cancelBy,
    tooLate: cancelBy < today,
  };
}

/** The last day to give notice that is still ahead: the next term's when this one's has passed. */
export function nextCancelBy(
  terms: ContractTerms,
  dates: ContractDates,
): LocalDate | null {
  if (!dates.tooLate) {
    return dates.cancelBy;
  }
  if (!terms.autoRenews || !terms.contractMonths) {
    return null;
  }
  return minusDays(
    addMonths(dates.termEndsOn, terms.contractMonths),
    terms.noticeDays ?? 0,
  );
}

export interface DatedPayment extends ContractTerms {
  id: string;
  name: string;
  amount: number;
  currency: string;
  isActive: boolean;
  period: 'month' | 'year';
  dayOfMonth: number;
  monthOfYear: number | null;
  trialEndsOn: LocalDate | null;
  priceLockedUntil: LocalDate | null;
  contract: ContractDates | null;
}

/** The next charge of a yearly payment, today or later. */
export function nextYearlyCharge(
  payment: Pick<DatedPayment, 'dayOfMonth' | 'monthOfYear'>,
  today: LocalDate,
): LocalDate | null {
  if (!payment.monthOfYear) {
    return null;
  }
  const {year} = parseLocalDate(today);
  for (const y of [year, year + 1]) {
    const day = Math.min(
      payment.dayOfMonth,
      daysInMonth(y, payment.monthOfYear),
    );
    const date = toLocalDate({year: y, month: payment.monthOfYear, day});
    if (date >= today) {
      return date;
    }
  }
  return null;
}

/**
 * The dates of the active payments worth knowing ahead, from today to `horizon` days on, the
 * nearest first: the last day to give notice, the end of a term that does not renew, the end of
 * a price lock or a free trial, a yearly charge.
 */
export function keyDates(
  payments: DatedPayment[],
  today: LocalDate,
  horizon = 365,
): KeyDate[] {
  const until = toLocalDate(addDays(parseLocalDate(today), horizon));
  const found: KeyDate[] = [];
  for (const payment of payments.filter(one => one.isActive)) {
    const add = (kind: KeyDateKind, date: LocalDate | null) => {
      if (date && date >= today && date <= until) {
        const {id, name, amount, currency} = payment;
        found.push({paymentId: id, name, kind, date, amount, currency});
      }
    };
    if (payment.contract) {
      add('cancel-by', nextCancelBy(payment, payment.contract));
      if (!payment.autoRenews) {
        add('term-end', payment.contract.termEndsOn);
      }
    }
    add('price-lock', payment.priceLockedUntil);
    add('trial', payment.trialEndsOn);
    if (payment.period === 'year') {
      add('renewal', nextYearlyCharge(payment, today));
    }
  }
  return found.sort(
    (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
  );
}

/** How many days ahead a key date is reminded of; the trial has its own reminder. */
export const REMIND_DAYS: Partial<Record<KeyDateKind, number>> = {
  'cancel-by': 14,
  'term-end': 14,
  'price-lock': 7,
  renewal: 7,
};

/** The key dates to remind of today: near enough and not reminded of yet. */
export function datesToRemind(
  dates: KeyDate[],
  notified: Map<string, string[]>,
  today: LocalDate,
): KeyDate[] {
  return dates.filter(date => {
    const days = REMIND_DAYS[date.kind];
    return (
      days !== undefined &&
      date.date <= toLocalDate(addDays(parseLocalDate(today), days)) &&
      !(notified.get(date.paymentId) ?? []).includes(remindKey(date))
    );
  });
}

export function remindKey(date: Pick<KeyDate, 'kind' | 'date'>): string {
  return `${date.kind}:${date.date}`;
}
