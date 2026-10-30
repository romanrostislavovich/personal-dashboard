import {pickMessages} from '@pd/api-core';
import {EventFeeling} from '@pd/contracts';

/** Server texts of the section: the export of events and the brief for an appointment. */
const messages = {
  en: {
    eventsTitle: 'Events',
    eventsAll: 'All events',
    eventsPeriod: (from: string, to: string) => `${from} – ${to}`,
    eventsHeaders: ['From', 'To', 'Event', 'How it felt', 'Description'],
    ongoing: '',
    /** Stands in the "From" column of an event told by age. */
    age: (from: number, to: number | null) =>
      to === null || to === undefined ? `Age ${from}` : `Age ${from}–${to}`,
    feelings: {
      '-2': 'Very hard',
      '-1': 'Hard',
      '0': 'Neutral',
      '1': 'Good',
      '2': 'Very good',
    },
    reminderTitle: (test: string) => `🪞 Time for ${test}`,
    reminderBody: (since: number | null, link: string) =>
      `${since === null ? 'A couple of minutes to see how you are.' : `${since} days since the last one.`}
${link}`,
    brief: {
      period: (from: string, to: string) => `Period: ${from} – ${to}`,
      appointment: (date: string) => `Appointment: ${date}`,
      changes: 'What changed',
      checkups: 'Questionnaires',
      trend: (test: string, first: number, last: number, times: number) =>
        times > 1
          ? `${test}: ${first} → ${last} (${times} times)`
          : `${test}: ${last}`,
      checkupHeaders: ['Date', 'Questionnaire', 'Score', 'Band'],
      care: (answer: number) =>
        `Item 9 (thoughts of self-harm): ${answer} of 3`,
      events: 'Events of the period',
      eventHeaders: ['When', 'Event', 'How it felt', 'Details'],
      questions: 'Questions',
      notes: 'My notes',
      footer:
        'Put together by me from my own records in Personal Dashboard. The questionnaires are self-observation, not a diagnosis.',
      tests: {
        who5: 'WHO-5 well-being (0–100, higher is better)',
        gad7: 'GAD-7 anxiety (0–21)',
        phq9: 'PHQ-9 mood (0–27)',
      },
      bands: {
        low: 'low',
        fine: 'usual range',
        minimal: 'minimal',
        mild: 'mild',
        moderate: 'moderate',
        moderatelySevere: 'moderately severe',
        severe: 'severe',
      } as Record<string, string>,
    },
  },
  ru: {
    eventsTitle: 'События',
    eventsAll: 'Все события',
    eventsPeriod: (from: string, to: string) => `${from} – ${to}`,
    eventsHeaders: ['С', 'По', 'Событие', 'Как ощущалось', 'Описание'],
    ongoing: '',
    age: (from: number, to: number | null) =>
      to === null || to === undefined
        ? `Возраст: ${from}`
        : `Возраст: ${from}–${to}`,
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
    brief: {
      period: (from: string, to: string) => `Период: ${from} – ${to}`,
      appointment: (date: string) => `Приём: ${date}`,
      changes: 'Что изменилось',
      checkups: 'Опросники',
      trend: (test: string, first: number, last: number, times: number) =>
        times > 1
          ? `${test}: ${first} → ${last} (${times} раз)`
          : `${test}: ${last}`,
      checkupHeaders: ['Дата', 'Опросник', 'Баллы', 'Уровень'],
      care: (answer: number) =>
        `Пункт 9 (мысли о самоповреждении): ${answer} из 3`,
      events: 'События периода',
      eventHeaders: ['Когда', 'Событие', 'Как ощущалось', 'Подробности'],
      questions: 'Вопросы',
      notes: 'Мои заметки',
      footer:
        'Составлено мной из моих собственных записей в Personal Dashboard. Опросники — самонаблюдение, а не диагноз.',
      tests: {
        who5: 'WHO-5, самочувствие (0–100, чем выше, тем лучше)',
        gad7: 'GAD-7, тревога (0–21)',
        phq9: 'PHQ-9, настроение (0–27)',
      },
      bands: {
        low: 'низкое',
        fine: 'в обычных пределах',
        minimal: 'минимальный',
        mild: 'лёгкий',
        moderate: 'умеренный',
        moderatelySevere: 'умеренно тяжёлый',
        severe: 'тяжёлый',
      } as Record<string, string>,
    },
  },
};

export function psychologyMessages(locale: string | undefined) {
  return pickMessages(messages, locale ?? 'en');
}

export function feelingText(
  locale: string | undefined,
  feeling: EventFeeling,
): string {
  return psychologyMessages(locale).feelings[
    String(feeling) as '-2' | '-1' | '0' | '1' | '2'
  ];
}
