import { Locale, SUPPORTED_LOCALES } from '@pd/contracts';

const STORAGE_KEY = 'pd.lang';

/**
 * UI language at startup: saved choice → browser language → English.
 * The profile language is applied after sign-in (see AuthService) via `applyLanguage`.
 */
export function initialLanguage(): Locale {
  return (
    toSupported(readStored()) ??
    toSupported(typeof navigator === 'undefined' ? null : navigator.language) ??
    'en'
  );
}

/**
 * Switches the language. Date and number formats (LOCALE_ID) are set when Angular starts,
 * so the page reloads after a language change.
 */
export function applyLanguage(locale: string): void {
  const next = toSupported(locale);
  if (!next || next === initialLanguage()) {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage is unavailable — the language lasts until a reload.
  }
  location.reload();
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function toSupported(value: string | null | undefined): Locale | null {
  const short = value?.slice(0, 2).toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(short ?? '') ? (short as Locale) : null;
}
