/* What the Links page keeps on this device, and its dates. */

/** The filter's choice, remembered on this device. */
export const PAIRS_KEY = 'pd.links.pairs';
export const EXTRA_KEY = 'pd.links.extra';

export function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A private window: the choice lasts until the page is closed.
  }
}

export function localDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
