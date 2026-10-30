import {financeApi} from '@pd/client-core';
import {ProductInfo, readProductPage, Wish} from '@pd/contracts';
import {PageCommand, PageHtml, WishPopupState} from '../shared/messages';
import {signedInClient} from './account';
import {activeTab} from './fill';

/*
 * The wishlist in one click: the product of the page in front is read here, in the browser —
 * the page as the person sees it, so a shop that turns a server away is read too — and goes to
 * Finance → Wishlist, which then watches its price. A wish already there gets the price seen.
 */

/** The product of a tab, as its page describes it (JSON-LD, Open Graph, microdata). */
async function productOf(tabId: number): Promise<ProductInfo | null> {
  const command: PageCommand = {type: 'product'};
  const page = (await chrome.tabs
    .sendMessage(tabId, command, {frameId: 0})
    .catch(() => null)) as PageHtml | null;
  if (!page?.html) {
    return null;
  }
  const info = readProductPage(page.html);
  // A page with a name only (any article has a title) is not a product's.
  return info.price !== null ? info : null;
}

/** The same page: the address without its fragment and the tracking parameters. */
function samePage(a: string, b: string): boolean {
  const clean = (url: string) => {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      for (const key of [...parsed.searchParams.keys()]) {
        if (/^(utm_|gclid|fbclid|ref)/i.test(key)) {
          parsed.searchParams.delete(key);
        }
      }
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return url;
    }
  };
  return clean(a) === clean(b);
}

/**
 * The card of the popup: the product of the page and whether it is in the wishlist already.
 * `null` — the page is not a product's (or the extension is signed out).
 */
export async function wishPopupState(): Promise<WishPopupState | null> {
  const tab = await activeTab();
  const product = tab ? await productOf(tab.id) : null;
  if (!tab || !product) {
    return null;
  }
  const api = financeApi((await signedInClient()).api);
  const wish =
    (await api.wishlist()).find(
      one => one.url !== null && samePage(one.url, tab.url),
    ) ?? null;
  if (wish && product.price !== null) {
    await notePrice(api, wish, product);
  }
  return {
    url: tab.url,
    name: product.name,
    price: product.price,
    currency: product.currency,
    image: product.image,
    wishId: wish?.id ?? null,
  };
}

/** A price seen on the page in front is the wish's price of today (no message about it). */
async function notePrice(
  api: ReturnType<typeof financeApi>,
  wish: Wish,
  product: ProductInfo,
) {
  const currency = product.currency ?? wish.currency;
  if (
    product.price === null ||
    (product.price === wish.price && currency === wish.currency)
  ) {
    return;
  }
  await api
    .saveWish({url: wish.url, price: product.price, currency}, wish.id)
    .catch(() => undefined);
}

/** "To the wishlist": the page in front, with what the browser read of it. */
export async function addWish(): Promise<Wish> {
  const tab = await activeTab();
  if (!tab) {
    throw new Error('No web page in front');
  }
  const product = await productOf(tab.id);
  const api = financeApi((await signedInClient()).api);
  return api.saveWish({
    url: tab.url,
    name: product?.name?.slice(0, 200) ?? null,
    price: product?.price ?? null,
    currency: product?.currency ?? null,
    imageUrl:
      product?.image && /^https?:/.test(product.image) ? product.image : null,
  });
}
