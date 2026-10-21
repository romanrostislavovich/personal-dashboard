import { pickMessages } from '../i18n/locale';

const messages = {
  en: {
    noAi: 'Configure AI before generating a chronicle.',
    invalidReply: 'The AI returned an invalid chronicle. Nothing was saved; you can try again.',
    futureDay: 'A chronicle cannot be generated for a future day.',
  },
  ru: {
    noAi: 'Перед созданием хроники настройте AI.',
    invalidReply: 'AI вернул некорректную хронику. Ничего не сохранено; можно попробовать снова.',
    futureDay: 'Нельзя создать хронику будущего дня.',
  },
};

export const lifelogMessages = (locale: string | null | undefined) =>
  pickMessages(messages, locale);
