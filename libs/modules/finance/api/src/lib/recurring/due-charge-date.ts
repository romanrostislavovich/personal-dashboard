import { DateParts, daysInMonth, LocalDate, toLocalDate } from '@pd/contracts';

interface ChargeablePayment {
  dayOfMonth: number;
  period?: 'month' | 'year';
  monthOfYear?: number | null;
  trialEndsOn?: LocalDate | null;
  isActive: boolean;
  lastChargedOn: LocalDate | null;
}

/**
 * The charge date in the current month if the payment is due, otherwise `null`.
 *
 * - Day 31 in a short month means the last day of the month.
 * - If the server was off on the charge day, the payment is made on the next run
 *   (but still with the charge date, not the run date).
 * - A payment is not made twice in the same month.
 * - A yearly payment is due only in its month; nothing is charged before a free trial ends.
 */
export function dueChargeDate(payment: ChargeablePayment, today: DateParts): LocalDate | null {
  if (!payment.isActive) {
    return null;
  }
  if (payment.period === 'year' && payment.monthOfYear !== today.month) {
    return null;
  }
  const chargeDay = Math.min(payment.dayOfMonth, daysInMonth(today.year, today.month));
  if (today.day < chargeDay) {
    return null;
  }
  const chargeDate = toLocalDate({ year: today.year, month: today.month, day: chargeDay });
  // ISO dates `YYYY-MM-DD` compare correctly as strings.
  if (payment.lastChargedOn && payment.lastChargedOn >= chargeDate) {
    return null;
  }
  if (payment.trialEndsOn && chargeDate < payment.trialEndsOn) {
    return null;
  }
  return chargeDate;
}
