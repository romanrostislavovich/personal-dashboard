import { resolveLocale, toSupportedLocale } from '@pd/client-core';
import { Locale } from '@pd/contracts';

const STORAGE_KEY = 'pd.lang';

/**
 * UI language at startup: saved choice → browser languages → English (see `resolveLocale`).
 * The profile language is applied after sign-in (see AuthService) via `applyLanguage`.
 */
export function initialLanguage(): Locale {
  const browser =
    typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  return resolveLocale(readStored(), browser);
}

/**
 * Switches the language. Date and number formats (LOCALE_ID) are set when Angular starts,
 * so the page reloads after a language change.
 */
export function applyLanguage(locale: string): void {
  const next = toSupportedLocale(locale);
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
