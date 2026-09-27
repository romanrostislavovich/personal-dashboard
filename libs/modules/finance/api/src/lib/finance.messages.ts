import { pickMessages } from '@pd/api-core';
import { RecurringPayment } from '@pd/contracts';

const list = (payments: RecurringPayment[]) =>
  payments.map((p) => `• ${p.name}: ${p.amount.toFixed(2)} ${p.currency}`).join('\n');

/** Тексты уведомлений модуля; язык выбирается по `user.locale`. */
const messages = {
  en: {
    chargedTitle: '💸 Recurring payments',
    chargedBody: (payments: RecurringPayment[]) => `Charged:\n${list(payments)}`,
  },
  ru: {
    chargedTitle: '💸 Регулярные платежи',
    chargedBody: (payments: RecurringPayment[]) => `Проведены списания:\n${list(payments)}`,
  },
};

export function financeMessages(locale: string) {
  return pickMessages(messages, locale);
}
