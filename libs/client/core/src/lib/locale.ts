import {Locale, SUPPORTED_LOCALES} from '@pd/contracts';

/** `ru-RU`, `RU`, `ru` → `ru`; an unsupported language → `null`. */
export function toSupportedLocale(
  value: string | null | undefined,
): Locale | null {
  const short = value?.slice(0, 2).toLowerCase() ?? '';
  return (SUPPORTED_LOCALES as readonly string[]).includes(short)
    ? (short as Locale)
    : null;
}

/**
 * The UI language at start: the saved choice, else English — not the device's language, so
 * everyone starts the same and picks theirs in Settings. After sign-in the profile one takes over.
 */
export function resolveLocale(saved: string | null): Locale {
  return toSupportedLocale(saved) ?? 'en';
}
