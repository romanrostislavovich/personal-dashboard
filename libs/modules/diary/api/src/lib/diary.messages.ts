import { pickMessages } from '@pd/api-core';

/** Тексты модуля (уведомления и ответы бота); язык выбирается по `user.locale`. */
const messages = {
  en: {
    commandDescription: 'Diary entry: /d text',
    usage: 'Write text after the command, e.g.:\n/d Shipped the release today #work',
    saved: '📔 Saved to your diary',
    reminderTitle: '📔 Diary',
    reminderBody: 'How was your day? Reply here with /d and a couple of sentences.',
    weeklyTitle: '📔 Your week in the diary',
  },
  ru: {
    commandDescription: 'Запись в дневник: /d текст',
    usage: 'Напиши текст после команды, например:\n/d Сегодня закончил релиз #работа',
    saved: '📔 Записал в дневник',
    reminderTitle: '📔 Дневник',
    reminderBody: 'Как прошёл день? Ответь сюда командой /d и парой предложений.',
    weeklyTitle: '📔 Неделя в дневнике',
  },
};

export function diaryMessages(locale: string) {
  return pickMessages(messages, locale);
}
