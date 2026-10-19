import { pickMessages } from '@pd/api-core';
import { KeyDateKind, RecurringPayment } from '@pd/contracts';
import { ReadReceipt } from './receipts/receipt-parse';

/** Text from a receipt goes into an HTML message of the bot. */
const html = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const list = (payments: RecurringPayment[]) =>
  payments.map((p) => `• ${p.name}: ${p.amount.toFixed(2)} ${p.currency}`).join('\n');

/** "1899.00 → 1699.00 PLN (−10.5%)". */
const priceChange = (was: number, now: number, currency: string) => {
  const percent = (Math.abs(now - was) / was) * 100;
  return `${was.toFixed(2)} → ${now.toFixed(2)} ${currency} (${now < was ? '−' : '+'}${percent.toFixed(1)}%)`;
};

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
    keyDateTitle: (kind: KeyDateKind, name: string) =>
      ({
        'cancel-by': `📅 ${name}: the last day to give notice is near`,
        'term-end': `📅 ${name}: the contract ends soon`,
        'price-lock': `📅 ${name}: the fixed price ends soon`,
        trial: `⏳ The free trial of ${name} ends soon`,
        renewal: `📅 ${name} renews soon`,
      })[kind],
    keyDateBody: (kind: KeyDateKind, date: string, amount: number, currency: string) =>
      ({
        'cancel-by': `Give notice by ${date} if you want to leave or to ask for a better price: otherwise the contract runs another term. Finance → Recurring drafts the letter.`,
        'term-end': `The term ends on ${date}. Renew it or look for another offer.`,
        'price-lock': `The price is fixed until ${date}; after that it may go up. A good moment to ask for a better one.`,
        trial: `It ends on ${date}; after that ${amount.toFixed(2)} ${currency} will be charged.`,
        renewal: `${amount.toFixed(2)} ${currency} will be charged on ${date}. Cancel it before then if you do not need it.`,
      })[kind],
    goalReachedTitle: (name: string) => `🎉 Goal reached: ${name}`,
    goalReachedBody: (saved: number, currency: string) =>
      `${saved.toFixed(2)} ${currency} saved. Well done!`,
    reportNote: (summary: string) => `💰 Money: ${summary}`,
    wishCheaperTitle: (name: string) => `📉 Cheaper: ${name}`,
    wishPricierTitle: (name: string) => `📈 More expensive: ${name}`,
    wishPriceBody: (was: number, now: number, currency: string, isLowest: boolean, url: string) =>
      `${priceChange(was, now, currency)}\n` +
      (isLowest ? 'The lowest price since you added it.\n' : '') +
      url,
    uncategorized: 'Uncategorized',
    bankExpiringTitle: (bank: string) => `🏦 ${bank}: confirm the access again`,
    bankExpiringBody: (date: string, url: string) =>
      `The bank's consent ends on ${date}: after it the transactions stop coming. ` +
      `Settings → Integrations → Bank → Confirm again.\n${url}`,
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
    keyDateTitle: (kind: KeyDateKind, name: string) =>
      ({
        'cancel-by': `📅 ${name}: скоро последний день, чтобы отказаться`,
        'term-end': `📅 ${name}: договор скоро закончится`,
        'price-lock': `📅 ${name}: скоро закончится фиксированная цена`,
        trial: `⏳ Скоро кончится пробный период ${name}`,
        renewal: `📅 ${name} скоро продлится`,
      })[kind],
    keyDateBody: (kind: KeyDateKind, date: string, amount: number, currency: string) =>
      ({
        'cancel-by': `Сообщите до ${date}, если хотите уйти или попросить цену ниже, — иначе договор продлится ещё на срок. Письмо можно составить в Финансы → Регулярные.`,
        'term-end': `Срок заканчивается ${date}. Продлите его или поищите другое предложение.`,
        'price-lock': `Цена зафиксирована до ${date}, потом может вырасти. Хороший момент попросить цену ниже.`,
        trial: `Он заканчивается ${date}, потом спишут ${amount.toFixed(2)} ${currency}.`,
        renewal: `${date} спишут ${amount.toFixed(2)} ${currency}. Если не нужно — отмените до этого.`,
      })[kind],
    goalReachedTitle: (name: string) => `🎉 Цель достигнута: ${name}`,
    goalReachedBody: (saved: number, currency: string) =>
      `Накоплено ${saved.toFixed(2)} ${currency}. Отлично!`,
    reportNote: (summary: string) => `💰 Деньги: ${summary}`,
    wishCheaperTitle: (name: string) => `📉 Подешевело: ${name}`,
    wishPricierTitle: (name: string) => `📈 Подорожало: ${name}`,
    wishPriceBody: (was: number, now: number, currency: string, isLowest: boolean, url: string) =>
      `${priceChange(was, now, currency)}\n` +
      (isLowest ? 'Самая низкая цена с момента добавления.\n' : '') +
      url,
    uncategorized: 'Без категории',
    bankExpiringTitle: (bank: string) => `🏦 ${bank}: подтвердите доступ заново`,
    bankExpiringBody: (date: string, url: string) =>
      `Согласие банка заканчивается ${date}: после этого транзакции перестанут приходить. ` +
      `Настройки → Интеграции → Банк → Подтвердить заново.\n${url}`,
  },
};

export function financeMessages(locale: string) {
  return pickMessages(messages, locale);
}
