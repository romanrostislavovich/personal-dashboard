import { Locale, SUPPORTED_LOCALES } from '@pd/contracts';

/** Default language for server texts if the user has no supported one set. */
export const FALLBACK_LOCALE: Locale = 'en';

/**
 * Picks the set of texts for the user's language. Used in every `*.messages.ts`:
 *
 * ```ts
 * const messages = { en: { title: 'Birthday' }, ru: { title: 'День рождения' } };
 * const text = pickMessages(messages, user.locale);
 * ```
 */
export function pickMessages<T>(messages: Record<Locale, T>, locale: string | null | undefined): T {
  return messages[toLocale(locale)];
}

/** Any language string (`ru-RU`, `en`, `de`) → a supported Locale. */
export function toLocale(value: string | null | undefined): Locale {
  const short = value?.slice(0, 2).toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(short ?? '')
    ? (short as Locale)
    : FALLBACK_LOCALE;
}

/** Текст на нескольких языках: `{ en: 'Week in a row', ru: 'Неделя подряд' }`. */
export type LocalizedText = Partial<Record<Locale, string>>;

export function localize(text: LocalizedText | string, locale: string | null | undefined): string {
  if (typeof text === 'string') {
    return text;
  }
  return text[toLocale(locale)] ?? text[FALLBACK_LOCALE] ?? Object.values(text)[0] ?? '';
}
