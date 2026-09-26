import { DateParts, daysInMonth, LocalDate, toLocalDate } from '@pd/contracts';

interface ChargeablePayment {
  dayOfMonth: number;
  isActive: boolean;
  lastChargedOn: LocalDate | null;
}

/**
 * Дата списания в текущем месяце, если платёж пора провести, иначе `null`.
 *
 * - День 31 в коротком месяце означает последний день месяца.
 * - Если сервер был выключен в день списания, платёж проведётся в ближайший запуск
 *   (но всё равно датой списания, а не датой запуска).
 * - Повторно в том же месяце платёж не проводится.
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
  // ISO-даты `YYYY-MM-DD` корректно сравниваются как строки.
  if (payment.lastChargedOn && payment.lastChargedOn >= chargeDate) {
    return null;
  }
  return chargeDate;
}
