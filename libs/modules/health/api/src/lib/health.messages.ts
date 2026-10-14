import { pickMessages } from '@pd/api-core';
import { HealthDraftKind } from '@pd/contracts';
import { ReadFailure } from './documents/document-reader.service';

/** Server texts of the section: the replies about a medical document sent to Telegram. */
const messages = {
  en: {
    photoChoice: '🩺 A medical document',
    read: (kind: HealthDraftKind, link: string) =>
      `🩺 ${KINDS.en[kind]} read. Check it and save — nothing is recorded until you do:\n${link}`,
    failed: {
      scanned: 'This PDF is a scan: send its pages as photos.',
      noAi: 'The AI is not connected: Settings → AI.',
      noVision:
        'None of the AI connections reads pictures: pick one in Settings → AI (OpenAI, or a vision model of Ollama).',
      aiOff: 'Health is switched off for the AI (Settings → AI).',
      aiFailed: 'The AI did not answer. The photo is kept in Health → History; try again there.',
      unreadable:
        'Nothing could be read out of it. The photo is kept in Health → History; fill it in by hand.',
    } satisfies Record<ReadFailure, string>,
  },
  ru: {
    photoChoice: '🩺 Медицинский документ',
    read: (kind: HealthDraftKind, link: string) =>
      `🩺 ${KINDS.ru[kind]} прочитан(ы). Проверьте и сохраните — пока вы этого не сделаете, ничего не записано:\n${link}`,
    failed: {
      scanned: 'Этот PDF — скан: пришлите его страницы фотографиями.',
      noAi: 'ИИ не подключён: Настройки → ИИ.',
      noVision:
        'Ни одно ИИ-подключение не читает картинки: выберите его в Настройки → ИИ (OpenAI или vision-модель Ollama).',
      aiOff: 'Для ИИ раздел «Здоровье» выключен (Настройки → ИИ).',
      aiFailed: 'ИИ не ответил. Фото сохранено в Здоровье → История, попробуйте там ещё раз.',
      unreadable:
        'Ничего не удалось прочитать. Фото сохранено в Здоровье → История, заполните вручную.',
    } satisfies Record<ReadFailure, string>,
  },
};

const KINDS: Record<'en' | 'ru', Record<HealthDraftKind, string>> = {
  en: { visit: 'The visit', labs: 'The lab results', study: 'The study', other: 'The document' },
  ru: { visit: 'Визит', labs: 'Анализы', study: 'Исследование', other: 'Документ' },
};

export function healthMessages(locale: string | undefined) {
  return pickMessages(messages, locale ?? 'en');
}
