import { RecurringPayment } from '@pd/contracts';

/** Тексты уведомлений модуля; язык выбирается по `user.locale`. */
const messages = {
  ru: {
    chargedTitle: '💸 Регулярные платежи',
    chargedBody: (payments: RecurringPayment[]) =>
      'Проведены списания:\n' +
      payments.map((p) => `• ${p.name}: ${p.amount.toFixed(2)} ${p.currency}`).join('\n'),
  },
};

export function financeMessages(locale: string) {
  return messages[locale as keyof typeof messages] ?? messages.ru;
}
