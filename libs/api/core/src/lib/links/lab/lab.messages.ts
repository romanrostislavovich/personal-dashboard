import {pickMessages} from '../../i18n/locale';

/* The personal lab's messages in the user's language. */
const messages = {
  en: {
    changedTitle: '🧪 Today is a changed day',
    changedBody: (change: string, hypothesis: string) =>
      `Today: ${change}.\nThe question: ${hypothesis}`,
    ordinaryTitle: '🧪 Today is an ordinary day',
    ordinaryBody: (hypothesis: string) =>
      `Live it as usual — it is the day to compare with.\nThe question: ${hypothesis}`,
    ratingTitle: '🧪 How was it today?',
    rated: (value: number) => `Noted: ${value} of 5.`,
    unknown: 'That experiment is over or gone.',
    doneTitle: '🧪 The experiment is over',
    doneBody: (hypothesis: string) =>
      `${hypothesis}\nLife → Lab shows what came of it — a description, not a proof.`,
  },
  ru: {
    changedTitle: '🧪 Сегодня изменённый день',
    changedBody: (change: string, hypothesis: string) =>
      `Сегодня: ${change}.\nВопрос: ${hypothesis}`,
    ordinaryTitle: '🧪 Сегодня обычный день',
    ordinaryBody: (hypothesis: string) =>
      `Живите как обычно — это день для сравнения.\nВопрос: ${hypothesis}`,
    ratingTitle: '🧪 Как сегодня?',
    rated: (value: number) => `Записал: ${value} из 5.`,
    unknown: 'Этот эксперимент уже закончен или удалён.',
    doneTitle: '🧪 Эксперимент закончен',
    doneBody: (hypothesis: string) =>
      `${hypothesis}\nВ Жизнь → Лаборатория — что из этого вышло: описание, а не доказательство.`,
  },
};

export const labMessages = (locale: string | null | undefined) =>
  pickMessages(messages, locale);
