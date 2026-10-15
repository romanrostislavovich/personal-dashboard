import { pickMessages } from '@pd/api-core';

/** Server texts of the section: the evening question in Telegram and the replies to it. */
const messages = {
  en: {
    question: {
      alcohol: '🌙 A day without alcohol?',
      smoking: '🌙 A day without smoking?',
      custom: (name: string) => `🌙 A day without «${name}»?`,
    },
    body: (streak: number) =>
      streak > 0 ? `${streak} clean day(s) in a row so far.` : 'A new start today.',
    buttons: { clean: '✅ Yes, without', used: 'It happened' },
    clean: (streak: number) => `Noted. ${streak} day(s) in a row — keep going! 💪`,
    used: 'Noted. It happens: tomorrow is a new day 🌱',
    howMuch: (unit: string) => `How many ${unit}? Send a number (or anything else to skip).`,
    amount: (amount: number, unit: string) => `Noted: ${amount} ${unit}.`,
    noAmount: 'Noted without a number.',
    gone: 'This habit is gone.',
  },
  ru: {
    question: {
      alcohol: '🌙 Сегодня без алкоголя?',
      smoking: '🌙 Сегодня без сигарет?',
      custom: (name: string) => `🌙 Сегодня без «${name}»?`,
    },
    body: (streak: number) =>
      streak > 0 ? `Уже ${streak} дн. подряд без этого.` : 'Сегодня новый старт.',
    buttons: { clean: '✅ Да, без', used: 'Было' },
    clean: (streak: number) => `Отмечено. ${streak} дн. подряд — так держать! 💪`,
    used: 'Отмечено. Бывает: завтра новый день 🌱',
    howMuch: (unit: string) =>
      `Сколько (${unit})? Пришлите число (или что угодно, чтобы пропустить).`,
    amount: (amount: number, unit: string) => `Отмечено: ${amount} (${unit}).`,
    noAmount: 'Отмечено без количества.',
    gone: 'Этой привычки больше нет.',
  },
};

export function habitsMessages(locale: string | undefined) {
  return pickMessages(messages, locale ?? 'en');
}
