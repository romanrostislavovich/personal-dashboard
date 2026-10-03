import { pickMessages } from '@pd/api-core';
import { RecurringPayment } from '@pd/contracts';
import { ReadReceipt } from './receipts/receipt-parse';

/** Text from a receipt goes into an HTML message of the bot. */
const html = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
    receiptSaved: (r: ReadReceipt) =>
      `🧾 Recorded: <b>${html(r.shop || 'a purchase')}</b> — ${r.total.toFixed(2)} ${r.currency}, ` +
      `${html(r.category)}, ${r.date}`,
    receiptDelete: '🗑 Delete',
    receiptRemoved: 'Deleted.',
    receiptNoVision:
      'No AI connection here sees pictures. Add an OpenAI one (gpt-4o-mini) in Settings → Integrations → AI.',
    receiptUnreadable:
      'Could not read a receipt on this photo. Try a sharper one, the whole receipt in view.',
  },
  ru: {
    chargedTitle: '💸 Регулярные платежи',
    chargedBody: (payments: RecurringPayment[]) => `Проведены списания:\n${list(payments)}`,
    budgetTotal: 'все траты',
    budgetWarnTitle: (name: string) => `⚠️ Бюджет «${name}»: потрачено 80%`,
    budgetExceededTitle: (name: string) => `🚫 Бюджет «${name}» исчерпан`,
    budgetBody: (spent: number, limit: number, currency: string) =>
      `${spent.toFixed(2)} из ${limit.toFixed(2)} ${currency} в этом месяце.`,
    receiptSaved: (r: ReadReceipt) =>
      `🧾 Записал: <b>${html(r.shop || 'покупка')}</b> — ${r.total.toFixed(2)} ${r.currency}, ` +
      `${html(r.category)}, ${r.date}`,
    receiptDelete: '🗑 Удалить',
    receiptRemoved: 'Удалил.',
    receiptNoVision:
      'Нет подключения ИИ, которое видит картинки. Добавьте OpenAI (gpt-4o-mini) в Настройках → Интеграции → ИИ.',
    receiptUnreadable:
      'Не получилось прочитать чек на этом фото. Попробуйте почётче, чтобы чек был виден целиком.',
  },
};

export function financeMessages(locale: string) {
  return pickMessages(messages, locale);
}
