import { pickMessages } from '@pd/api-core';

/** Module texts (notifications and bot replies); the language is picked by `user.locale`. */
const messages = {
  en: {
    commandDescription: 'Diary entry: /d text',
    usage: 'Write text after the command, e.g.:\n/d Shipped the release today #work',
    saved: '📔 Saved to your diary',
    reminderTitle: '📔 Diary',
    reminderBody: 'How was your day? Tap a mood — then I will ask for a couple of words.',
    checkInAskWords: (emoji: string) =>
      `${emoji} Saved. A few words about the day? Your next message goes to the diary.`,
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
    reminderBody: 'Как прошёл день? Нажми на настроение — потом спрошу пару слов.',
    checkInAskWords: (emoji: string) =>
      `${emoji} Записал. Пару слов о дне? Следующее сообщение пойдёт в дневник.`,
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
