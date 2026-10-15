import { pickMessages } from '@pd/api-core';
import { EventFeeling } from '@pd/contracts';

/** Server texts of the section: the export of events. */
const messages = {
  en: {
    eventsTitle: 'Events',
    eventsAll: 'All events',
    eventsPeriod: (from: string, to: string) => `${from} – ${to}`,
    eventsHeaders: ['From', 'To', 'Event', 'How it felt', 'Description'],
    ongoing: '',
    /** Stands in the "From" column of an event told by age. */
    age: (from: number, to: number | null) => (to == null ? `Age ${from}` : `Age ${from}–${to}`),
    feelings: { '-2': 'Very hard', '-1': 'Hard', '0': 'Neutral', '1': 'Good', '2': 'Very good' },
    reminderTitle: (test: string) => `🪞 Time for ${test}`,
    reminderBody: (since: number | null, link: string) =>
      `${since === null ? 'A couple of minutes to see how you are.' : `${since} days since the last one.`}
${link}`,
  },
  ru: {
    eventsTitle: 'События',
    eventsAll: 'Все события',
    eventsPeriod: (from: string, to: string) => `${from} – ${to}`,
    eventsHeaders: ['С', 'По', 'Событие', 'Как ощущалось', 'Описание'],
    ongoing: '',
    age: (from: number, to: number | null) =>
      to == null ? `Возраст: ${from}` : `Возраст: ${from}–${to}`,
    feelings: {
      '-2': 'Очень тяжело',
      '-1': 'Тяжело',
      '0': 'Нейтрально',
      '1': 'Хорошо',
      '2': 'Очень хорошо',
    },
    reminderTitle: (test: string) => `🪞 Время для ${test}`,
    reminderBody: (since: number | null, link: string) =>
      `${since === null ? 'Пара минут, чтобы посмотреть, как вы.' : `С прошлого раза прошло ${since} дн.`}
${link}`,
  },
};

export function psychologyMessages(locale: string | undefined) {
  return pickMessages(messages, locale ?? 'en');
}

export function feelingText(locale: string | undefined, feeling: EventFeeling): string {
  return psychologyMessages(locale).feelings[String(feeling) as '-2' | '-1' | '0' | '1' | '2'];
}
