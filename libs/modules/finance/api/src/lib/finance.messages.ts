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
    priceRiseTitle: (name: string) => `📈 ${name} got more expensive`,
    priceRiseBody: (was: number, now: number, currency: string) =>
      `The bank charged ${now.toFixed(2)} ${currency} instead of ${was.toFixed(2)}. ` +
      'Update the price in Finance → Subscriptions if it stays.',
    trialTitle: (name: string) => `⏳ The free trial of ${name} ends soon`,
    trialBody: (ends: string, amount: number, currency: string) =>
      `It ends on ${ends}; after that ${amount.toFixed(2)} ${currency} will be charged. ` +
      'Cancel it now if you do not need it.',
    goalReachedTitle: (name: string) => `🎉 Goal reached: ${name}`,
    goalReachedBody: (saved: number, currency: string) =>
      `${saved.toFixed(2)} ${currency} saved. Well done!`,
    reportNote: (summary: string) => `💰 Money: ${summary}`,
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
    priceRiseTitle: (name: string) => `📈 ${name} подорожала`,
    priceRiseBody: (was: number, now: number, currency: string) =>
      `Банк списал ${now.toFixed(2)} ${currency} вместо ${was.toFixed(2)}. ` +
      'Если цена теперь такая, обновите её в Финансах → Подписки.',
    trialTitle: (name: string) => `⏳ Скоро кончится пробный период ${name}`,
    trialBody: (ends: string, amount: number, currency: string) =>
      `Он заканчивается ${ends}, потом спишут ${amount.toFixed(2)} ${currency}. ` +
      'Если не нужно — отмените сейчас.',
    goalReachedTitle: (name: string) => `🎉 Цель достигнута: ${name}`,
    goalReachedBody: (saved: number, currency: string) =>
      `Накоплено ${saved.toFixed(2)} ${currency}. Отлично!`,
    reportNote: (summary: string) => `💰 Деньги: ${summary}`,
  },
};

export function financeMessages(locale: string) {
  return pickMessages(messages, locale);
}
