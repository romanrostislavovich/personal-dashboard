import { Locale, SUPPORTED_LOCALES } from '@pd/contracts';

/** `ru-RU`, `RU`, `ru` → `ru`; an unsupported language → `null`. */
export function toSupportedLocale(value: string | null | undefined): Locale | null {
  const short = value?.slice(0, 2).toLowerCase() ?? '';
  return (SUPPORTED_LOCALES as readonly string[]).includes(short) ? (short as Locale) : null;
}

/**
 * The UI language at start: the saved choice, then the device languages in order of
 * preference, then English. After sign-in the profile language takes over.
 */
export function resolveLocale(saved: string | null, deviceLanguages: readonly string[]): Locale {
  for (const candidate of [saved, ...deviceLanguages]) {
    const locale = toSupportedLocale(candidate);
    if (locale) {
      return locale;
    }
  }
  return 'en';
}
