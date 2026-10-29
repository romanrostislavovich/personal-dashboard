import { pickMessages } from '@pd/api-core';
import { ReactionFeeling } from '@pd/contracts';

/** Server texts of the band: the notification of a reaction of the body and its buttons. */
const messages = {
  en: {
    reaction: {
      title: '💓 Your body reacted',
      body: (time: string, peak: number, baseline: number, minutes: number) =>
        `At ${time} your pulse rose to ${peak} (yours at rest is ${baseline}) for ${minutes} min without moving. How do you feel?`,
    },
    feelings: {
      calm: '😌 Calm',
      anxious: '😟 Anxious',
      irritated: '😠 Irritated',
      excited: '🤩 Excited',
      active: '🏃 I was moving',
      other: 'Something else',
    } satisfies Record<ReactionFeeling, string>,
    saved: (feeling: string) => `Noted: ${feeling}.`,
    gone: 'This reaction is gone.',
  },
  ru: {
    reaction: {
      title: '💓 Тело среагировало',
      body: (time: string, peak: number, baseline: number, minutes: number) =>
        `В ${time} пульс поднялся до ${peak} (твой в покое — ${baseline}) на ${minutes} мин без движения. Как ты себя чувствуешь?`,
    },
    feelings: {
      calm: '😌 Спокойно',
      anxious: '😟 Тревожно',
      irritated: '😠 Злюсь',
      excited: '🤩 Воодушевлён',
      active: '🏃 Я двигался',
      other: 'Другое',
    } satisfies Record<ReactionFeeling, string>,
    saved: (feeling: string) => `Отмечено: ${feeling}.`,
    gone: 'Этой реакции больше нет.',
  },
};

export function bandMessages(locale: string | null | undefined) {
  return pickMessages(messages, locale);
}
