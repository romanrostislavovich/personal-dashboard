import {pickMessages} from '@pd/api-core';

/** Server texts of the places: "Where were you?" and the replies to it. */
const messages = {
  en: {
    question: '📍 Where were you?',
    when: (from: string, to: string, offered: boolean) =>
      `${from}–${to}` +
      (offered
        ? ' — one of these, or another place?'
        : ' — the place has no name yet.'),
    another: 'Another place…',
    typeName: 'What is the place called? Write its name.',
    saved: (name: string) =>
      `Saved: «${name}» — the place is named so from now on 📍`,
    notSaved: 'No name — nothing saved.',
    gone: 'This question is no longer there.',
  },
  ru: {
    question: '📍 Где ты был?',
    when: (from: string, to: string, offered: boolean) =>
      `${from}–${to}` +
      (offered
        ? ' — одно из этих мест или другое?'
        : ' — у места ещё нет названия.'),
    another: 'Другое место…',
    typeName: 'Как называется это место? Напиши название.',
    saved: (name: string) =>
      `Записал: «${name}» — теперь место так и называется 📍`,
    notSaved: 'Без названия — ничего не сохранил.',
    gone: 'Этого вопроса уже нет.',
  },
};

export type PlacesMessages = (typeof messages)['en'];

export function placesMessages(
  locale: string | null | undefined,
): PlacesMessages {
  return pickMessages(messages, locale ?? 'en');
}
