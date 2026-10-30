/** ISO 4217 codes the runtime knows: "tea" or "bus" after the amount is not a currency. */
const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

/**
 * `/spent 12 coffee`, `/spent 12,50 EUR taxi`: the amount first, a currency code if it is not
 * the main one, then what it was for. `null` — not an expense written that way.
 */
export function parseSpent(
  text: string,
): {amount: number; currency: string | null; what: string} | null {
  const match = /^(\d+(?:[.,]\d{1,2})?)\s*(.*)$/.exec(text.trim());
  if (!match) {
    return null;
  }
  const amount = Number(match[1].replace(',', '.'));
  if (!(amount > 0)) {
    return null;
  }
  const [first = '', ...rest] = match[2].trim().split(/\s+/);
  const code = first.toUpperCase();
  return CURRENCIES.has(code)
    ? {amount, currency: code, what: rest.join(' ')}
    : {amount, currency: null, what: match[2].trim()};
}

/**
 * The category of an expense written in a few words: one of the user's own that a word names
 * (`coffee with Anna` → "Coffee"), or the words themselves; none — "Other".
 */
export function categoryFor(
  what: string,
  known: readonly string[],
  fallback: string,
): string {
  const words = what
    .toLowerCase()
    .split(/[\s,.;!?]+/)
    .filter(Boolean);
  const named = known.find(category => {
    const name = category.toLowerCase();
    return words.includes(name) || what.toLowerCase() === name;
  });
  if (named) {
    return named;
  }
  const own = what.trim().slice(0, 50);
  return own ? own.charAt(0).toUpperCase() + own.slice(1) : fallback;
}
