import { Locale, SUPPORTED_LOCALES } from '@pd/contracts';

const STORAGE_KEY = 'pd.lang';

/**
 * Язык интерфейса при старте: сохранённый выбор → язык браузера → английский.
 * Язык из профиля применяется после входа (см. AuthService) через `applyLanguage`.
 */
export function initialLanguage(): Locale {
  return (
    toSupported(readStored()) ??
    toSupported(typeof navigator === 'undefined' ? null : navigator.language) ??
    'en'
  );
}

/**
 * Переключает язык. Форматы дат и чисел (LOCALE_ID) задаются при старте Angular,
 * поэтому после смены языка страница перезагружается.
 */
export function applyLanguage(locale: string): void {
  const next = toSupported(locale);
  if (!next || next === initialLanguage()) {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Хранилище недоступно — язык продержится до перезагрузки.
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
