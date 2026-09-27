/** Тексты модуля (уведомления и ответы бота); язык выбирается по `user.locale`. */
const messages = {
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
  return messages[locale as keyof typeof messages] ?? messages.ru;
}
