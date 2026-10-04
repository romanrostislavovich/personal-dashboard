import { Wish } from '@pd/contracts';

/** How the price moved at its last change: `null` — it has not changed yet. */
export function priceTrend(wish: Wish): { down: boolean; percent: string } | null {
  if (wish.price === null || !wish.previousPrice || wish.price === wish.previousPrice) {
    return null;
  }
  const percent = (Math.abs(wish.price - wish.previousPrice) / wish.previousPrice) * 100;
  return { down: wish.price < wish.previousPrice, percent: percent.toFixed(percent < 10 ? 1 : 0) };
}

/** The shop of a wish: the host of its link without `www.`. */
export function shopName(wish: Wish): string {
  try {
    return new URL(wish.url).hostname.replace(/^www\./, '');
  } catch {
    return wish.url;
  }
}
