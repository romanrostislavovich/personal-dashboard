import { pickMessages } from '@pd/api-core';
import { EventFeeling } from '@pd/contracts';

/** Server texts of the section: the export of events, the weekly questions. */
const messages = {
  en: {
    eventsTitle: 'Events',
    eventsAll: 'All events',
    eventsPeriod: (from: string, to: string) => `${from} – ${to}`,
    eventsHeaders: ['From', 'To', 'Event', 'How it felt', 'Description'],
    ongoing: '',
    feelings: { '-2': 'Very hard', '-1': 'Hard', '0': 'Neutral', '1': 'Good', '2': 'Very good' },
    /** Asked when there is no AI to write questions from the week's own data. */
    standardQuestions: [
      'What gave you energy this week, and what took it away?',
      'What are you glad you did — and what would you do differently?',
      'What is the one thing that would make next week better?',
    ],
    reviewTitle: '🪞 Three questions about your week',
    reviewBody: (questions: string[]) =>
      `${questions.map((question, index) => `${index + 1}. ${question}`).join('\n')}\n\nAnswer in Psychology → Reflection.`,
    aiLanguage: 'English',
  },
  ru: {
    eventsTitle: 'События',
    eventsAll: 'Все события',
    eventsPeriod: (from: string, to: string) => `${from} – ${to}`,
    eventsHeaders: ['С', 'По', 'Событие', 'Как ощущалось', 'Описание'],
    ongoing: '',
    feelings: {
      '-2': 'Очень тяжело',
      '-1': 'Тяжело',
      '0': 'Нейтрально',
      '1': 'Хорошо',
      '2': 'Очень хорошо',
    },
    standardQuestions: [
      'Что на этой неделе давало силы, а что их забирало?',
      'Что вы рады, что сделали, — и что сделали бы иначе?',
      'Что одно сделало бы следующую неделю лучше?',
    ],
    reviewTitle: '🪞 Три вопроса о вашей неделе',
    reviewBody: (questions: string[]) =>
      `${questions.map((question, index) => `${index + 1}. ${question}`).join('\n')}\n\nОтветить можно в Психология → Рефлексия.`,
    aiLanguage: 'Russian',
  },
};

export function psychologyMessages(locale: string | undefined) {
  return pickMessages(messages, locale ?? 'en');
}

export function feelingText(locale: string | undefined, feeling: EventFeeling): string {
  return psychologyMessages(locale).feelings[String(feeling) as '-2' | '-1' | '0' | '1' | '2'];
}
