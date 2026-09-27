import { pickMessages } from '@pd/api-core';

/** Module texts (notifications and bot replies); the language is picked by `user.locale`. */
const messages = {
  en: {
    commandDescription: 'Diary entry: /d text',
    usage: 'Write text after the command, e.g.:\n/d Shipped the release today #work',
    saved: '📔 Saved to your diary',
    reminderTitle: '📔 Diary',
    reminderBody: 'How was your day? Reply here with /d and a couple of sentences.',
    weeklyTitle: '📔 Your week in the diary',
    moodDescription: 'Rate today: /mood 1–5',
    moodUsage: 'Send a number from 1 (bad) to 5 (great), e.g. /mood 4',
    moodSaved: (emoji: string) => `${emoji} Mood for today is saved`,
    todayDescription: 'Show today’s entry',
    todayEmpty: 'Nothing written today yet. Add a note with /d',
    photoSaved: '📷 Photo added to today’s entry',
  },
  ru: {
    commandDescription: 'Запись в дневник: /d текст',
    usage: 'Напиши текст после команды, например:\n/d Сегодня закончил релиз #работа',
    saved: '📔 Записал в дневник',
    reminderTitle: '📔 Дневник',
    reminderBody: 'Как прошёл день? Ответь сюда командой /d и парой предложений.',
    weeklyTitle: '📔 Неделя в дневнике',
    moodDescription: 'Оценить день: /mood 1–5',
    moodUsage: 'Отправь число от 1 (плохо) до 5 (отлично), например /mood 4',
    moodSaved: (emoji: string) => `${emoji} Настроение дня сохранено`,
    todayDescription: 'Показать сегодняшнюю запись',
    todayEmpty: 'Сегодня ещё ничего не записано. Добавь заметку командой /d',
    photoSaved: '📷 Фото добавлено в сегодняшнюю запись',
  },
};

export function diaryMessages(locale: string) {
  return pickMessages(messages, locale);
}
