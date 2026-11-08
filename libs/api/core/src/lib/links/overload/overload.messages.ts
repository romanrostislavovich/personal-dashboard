import {pickMessages} from '../../i18n/locale';

/*
 * The overload warning in the user's language: its signals have fixed keys, so the server can
 * name them (it has no translations of the other numbers).
 */

type Signal =
  | 'activity.phone.night'
  | 'activity.index.phone.restlessness'
  | 'health.band.sleep'
  | 'activity.index.deepWork'
  | 'development.commits'
  | 'diary.mood';

const messages = {
  en: {
    title: '🌧️ The last days look heavier than usual',
    names: {
      'activity.phone.night': 'the phone at night',
      'activity.index.phone.restlessness': 'a restless phone',
      'health.band.sleep': 'sleep',
      'activity.index.deepWork': 'deep work',
      'development.commits': 'commits',
      'diary.mood': 'the mood',
    } satisfies Record<Signal, string>,
    heavier: (what: string) => `Most of all: ${what}.`,
    /** One small step for the signal that pulls most. */
    steps: {
      'activity.phone.night':
        'A small step: put the phone away by 23:00 tonight.',
      'activity.index.phone.restlessness':
        'A small step: an hour with the notifications off.',
      'health.band.sleep': 'A small step: to bed half an hour earlier.',
      'activity.index.deepWork':
        'A small step: one short block of 25 minutes without notifications.',
      'development.commits': 'A light day fits: one small task is enough.',
      'diary.mood': 'A small step: a short walk, or ten minutes off screens.',
    } satisfies Record<Signal, string>,
    footer:
      'Not a diagnosis — your own numbers against your usual. Links shows the rest.',
  },
  ru: {
    title: '🌧️ Последние дни тяжелее обычного',
    names: {
      'activity.phone.night': 'телефон ночью',
      'activity.index.phone.restlessness': 'беспокойный телефон',
      'health.band.sleep': 'сон',
      'activity.index.deepWork': 'глубокая работа',
      'development.commits': 'коммиты',
      'diary.mood': 'настроение',
    } satisfies Record<Signal, string>,
    heavier: (what: string) => `Сильнее всего: ${what}.`,
    steps: {
      'activity.phone.night':
        'Маленький шаг: сегодня отложить телефон к 23:00.',
      'activity.index.phone.restlessness':
        'Маленький шаг: час с выключенными уведомлениями.',
      'health.band.sleep': 'Маленький шаг: лечь на полчаса раньше.',
      'activity.index.deepWork':
        'Маленький шаг: один короткий блок 25 минут без уведомлений.',
      'development.commits':
        'Лёгкий день подойдёт: хватит одной маленькой задачи.',
      'diary.mood':
        'Маленький шаг: короткая прогулка или десять минут без экрана.',
    } satisfies Record<Signal, string>,
    footer:
      'Это не диагноз — ваши собственные числа против вашей нормы. Подробности в Связях.',
  },
};

export const overloadMessages = (locale: string | null | undefined) =>
  pickMessages(messages, locale);

/** The warning's text: what pulls most (two at most) and one small step for the first. */
export function overloadBody(
  locale: string | null | undefined,
  heaviest: string[],
): string {
  const text = overloadMessages(locale);
  const known = heaviest.filter((key): key is Signal => key in text.names);
  if (!known.length) {
    return text.footer;
  }
  return [
    text.heavier(
      known
        .slice(0, 2)
        .map(key => text.names[key])
        .join(', '),
    ),
    text.steps[known[0]],
    text.footer,
  ].join('\n');
}
