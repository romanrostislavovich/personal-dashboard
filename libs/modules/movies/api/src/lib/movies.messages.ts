import {pickMessages} from '@pd/api-core';

/** Server texts of the section: "How was the film?" in Telegram and the replies to it. */
const messages = {
  en: {
    question: (title: string) => `🎬 How was «${title}»?`,
    body: 'Rate it from 1 to 10 — it goes to Movies.',
    notFinished: 'Did not finish',
    rated: (rating: number) =>
      `Saved: ${rating}/10. Want to add a few words? Write them or send a voice message — they become the film's note.`,
    noted: 'Saved the note 📝',
    unfinished: 'Got it: not finished, it is out of "Watched".',
    gone: 'This film is no longer in Movies.',
  },
  ru: {
    question: (title: string) => `🎬 Как тебе «${title}»?`,
    body: 'Оцени от 1 до 10 — оценка попадёт в «Фильмы».',
    notFinished: 'Не досмотрел',
    rated: (rating: number) =>
      `Записал: ${rating}/10. Хочешь — напиши пару слов или пришли голосовое: это станет заметкой к фильму.`,
    noted: 'Сохранил заметку 📝',
    unfinished: 'Понял: не досмотрел, убрал из «Просмотрено».',
    gone: 'Этого фильма уже нет в «Фильмах».',
  },
};

export type MoviesMessages = (typeof messages)['en'];

export function moviesMessages(
  locale: string | null | undefined,
): MoviesMessages {
  return pickMessages(messages, locale ?? 'en');
}
