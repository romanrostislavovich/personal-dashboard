import { DateParts, daysInMonth, LocalDate, toLocalDate } from '@pd/contracts';

interface ChargeablePayment {
  dayOfMonth: number;
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
 */
export function dueChargeDate(payment: ChargeablePayment, today: DateParts): LocalDate | null {
  if (!payment.isActive) {
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
  return chargeDate;
}
