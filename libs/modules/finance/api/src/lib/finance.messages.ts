import { pickMessages } from '@pd/api-core';
import { RecurringPayment } from '@pd/contracts';

const list = (payments: RecurringPayment[]) =>
  payments.map((p) => `• ${p.name}: ${p.amount.toFixed(2)} ${p.currency}`).join('\n');

/** Module notification texts; the language is picked by `user.locale`. */
const messages = {
  en: {
    chargedTitle: '💸 Recurring payments',
    chargedBody: (payments: RecurringPayment[]) => `Charged:\n${list(payments)}`,
    budgetTotal: 'all expenses',
    budgetWarnTitle: (name: string) => `⚠️ Budget "${name}": 80% spent`,
    budgetExceededTitle: (name: string) => `🚫 Budget "${name}" is spent`,
    budgetBody: (spent: number, limit: number, currency: string) =>
      `${spent.toFixed(2)} of ${limit.toFixed(2)} ${currency} this month.`,
  },
  ru: {
    chargedTitle: '💸 Регулярные платежи',
    chargedBody: (payments: RecurringPayment[]) => `Проведены списания:\n${list(payments)}`,
    budgetTotal: 'все траты',
    budgetWarnTitle: (name: string) => `⚠️ Бюджет «${name}»: потрачено 80%`,
    budgetExceededTitle: (name: string) => `🚫 Бюджет «${name}» исчерпан`,
    budgetBody: (spent: number, limit: number, currency: string) =>
      `${spent.toFixed(2)} из ${limit.toFixed(2)} ${currency} в этом месяце.`,
  },
};

export function financeMessages(locale: string) {
  return pickMessages(messages, locale);
}
