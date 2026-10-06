import { LocalDate } from '@pd/contracts';

/** What a receipt says, as the AI read it. */
export interface ReadReceipt {
  shop: string;
  total: number;
  currency: string;
  date: LocalDate;
  category: string;
}

/** Only the date of the last year counts: an older or a future one is a misreading. */
const MAX_AGE_DAYS = 366;

/**
 * The AI's answer about a photo, checked: `null` — not a receipt, or nothing usable. A missing
 * currency is the main one, a missing or odd date is today.
 */
export function parseReceipt(
  answer: string,
  fallback: { currency: string; today: LocalDate },
): ReadReceipt | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
  const total = Number(String(raw['total'] ?? '').replace(',', '.'));
  if (raw['isReceipt'] === false || !Number.isFinite(total) || total <= 0 || total > 1_000_000) {
    return null;
  }
  const currency = /^[A-Za-z]{3}$/.test(String(raw['currency'] ?? ''))
    ? String(raw['currency']).toUpperCase()
    : fallback.currency;
  const date = String(raw['date'] ?? '');
  const age = (Date.parse(fallback.today) - Date.parse(date)) / 86_400_000;
  return {
    shop: String(raw['shop'] ?? '')
      .trim()
      .slice(0, 100),
    total: Math.round(total * 100) / 100,
    currency,
    date:
      /^\d{4}-\d{2}-\d{2}$/.test(date) && age >= 0 && age <= MAX_AGE_DAYS ? date : fallback.today,
    category:
      String(raw['category'] ?? '')
        .trim()
        .slice(0, 50) || 'Other',
  };
}
