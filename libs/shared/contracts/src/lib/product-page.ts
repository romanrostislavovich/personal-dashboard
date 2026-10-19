/** What a shop's page tells about a product. */
export interface ProductInfo {
  name: string | null;
  price: number | null;
  /** ISO 4217. */
  currency: string | null;
  image: string | null;
}

type Json = Record<string, unknown>;

/**
 * Reads a product from the page's HTML. Shops describe it for search engines in a few standard
 * ways, tried in this order: JSON-LD (`Product` with `offers`), Open Graph meta tags
 * (`product:price:amount`) and microdata (`itemprop="price"`). A page that draws its price with
 * scripts only gives none.
 */
export function readProductPage(html: string): ProductInfo {
  const product = jsonLdProduct(html);
  const offer = product ? cheapestOffer(product['offers']) : null;
  const tags = contentTags(html);

  const price =
    offer?.price ??
    parsePrice(tags.get('product:price:amount')) ??
    parsePrice(tags.get('og:price:amount')) ??
    parsePrice(tags.get('price'));
  const currency =
    offer?.currency ??
    tags.get('product:price:currency') ??
    tags.get('og:price:currency') ??
    tags.get('pricecurrency');

  return {
    name: clean(text(product?.['name']) ?? tags.get('og:title') ?? title(html)),
    price,
    currency:
      price !== null && currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null,
    image: imageUrl(product?.['image']) ?? tags.get('og:image') ?? null,
  };
}

/**
 * A price as shops write it: `1299.99`, `1 299,00 zł`, `1,299.00`, `1.299,00`. With both
 * separators the last one is the decimal one; a lone comma before exactly three digits separates
 * thousands, a lone dot is decimal (schema.org asks for a dot).
 */
export function parsePrice(value: unknown): number | null {
  if (typeof value === 'number') {
    return valid(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const digits = value.replace(/[^\d.,]/g, '').replace(/^[.,]+|[.,]+$/g, '');
  if (!digits) {
    return null;
  }
  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    normalized = digits.replaceAll(decimal === '.' ? ',' : '.', '').replace(',', '.');
  } else if (lastComma >= 0) {
    const thousands = digits.split(',').length > 2 || /,\d{3}$/.test(digits);
    normalized = thousands ? digits.replaceAll(',', '') : digits.replace(',', '.');
  } else {
    normalized = digits.split('.').length > 2 ? digits.replaceAll('.', '') : digits;
  }
  return valid(Number(normalized));
}

/** The page as plain text, for the AI: no scripts, styles or tags. */
export function pageText(html: string, limit: number): string {
  return decodeEntities(
    html.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

/** The AI's answer about a page's text, checked: no price — nothing usable. */
export function parseAiProduct(answer: string): Pick<ProductInfo, 'price' | 'currency'> | null {
  let raw: Json;
  try {
    raw = JSON.parse(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
  const price = parsePrice(raw['price']);
  const currency = String(raw['currency'] ?? '');
  return price !== null && /^[A-Za-z]{3}$/.test(currency)
    ? { price, currency: currency.toUpperCase() }
    : null;
}

function valid(price: number): number | null {
  return Number.isFinite(price) && price > 0 && price <= 1_000_000_000
    ? Math.round(price * 100) / 100
    : null;
}

/**
 * The product among the page's JSON-LD blocks. A page may describe several — a `ProductGroup`
 * without a price next to its `Product`, or the variants of a group: the first one with a price
 * is taken.
 */
function jsonLdProduct(html: string): Json | null {
  const blocks = html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  const products: Json[] = [];
  for (const [, body] of blocks) {
    try {
      collectProducts(JSON.parse(body), products);
    } catch {
      // A broken block: the page may have another one.
    }
  }
  return products.find((product) => cheapestOffer(product['offers'])) ?? products[0] ?? null;
}

/** Products may be nested: in `@graph`, as the page's `mainEntity`, as variants of a group. */
function collectProducts(node: unknown, found: Json[]): void {
  if (Array.isArray(node)) {
    node.forEach((item) => collectProducts(item, found));
    return;
  }
  if (!isObject(node)) {
    return;
  }
  const types = [node['@type']].flat();
  if (types.includes('Product') || types.includes('ProductGroup')) {
    found.push(node);
  }
  for (const key of ['@graph', 'mainEntity', 'hasVariant']) {
    collectProducts(node[key], found);
  }
}

/** The lowest price among the offers: a product with variants costs "from". */
function cheapestOffer(offers: unknown): { price: number; currency: string | null } | null {
  let best: { price: number; currency: string | null } | null = null;
  for (const offer of [offers].flat()) {
    if (!isObject(offer)) {
      continue;
    }
    const specification = [offer['priceSpecification']].flat().find(isObject);
    const price =
      parsePrice(offer['price']) ??
      parsePrice(offer['lowPrice']) ??
      parsePrice(specification?.['price']);
    if (price !== null && (!best || price < best.price)) {
      best = {
        price,
        currency: text(offer['priceCurrency']) ?? text(specification?.['priceCurrency']),
      };
    }
  }
  return best;
}

/**
 * Every tag with a `content` attribute by its `property`, `name` or `itemprop` (lower case):
 * meta tags and microdata alike. The first one of a name wins.
 */
function contentTags(html: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const [tag] of html.matchAll(/<[a-z][a-z0-9]*\b[^>]*\bcontent\s*=[^>]*>/gi)) {
    const attributes = new Map<string, string>();
    for (const [, name, , double, single] of tag.matchAll(
      /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g,
    )) {
      attributes.set(name.toLowerCase(), double ?? single ?? '');
    }
    const key = attributes.get('property') ?? attributes.get('name') ?? attributes.get('itemprop');
    const content = attributes.get('content');
    if (key && content && !tags.has(key.toLowerCase())) {
      tags.set(key.toLowerCase(), decodeEntities(content));
    }
  }
  return tags;
}

function title(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? decodeEntities(match[1]) : null;
}

/** `image` is a URL, a list of them or an `ImageObject`. */
function imageUrl(image: unknown): string | null {
  const first = [image].flat()[0];
  return text(isObject(first) ? first['url'] : first);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Shops escape names even inside JSON-LD. */
function clean(name: string | null | undefined): string | null {
  return name ? decodeEntities(name).replace(/\s+/g, ' ').trim().slice(0, 200) || null : null;
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] !== '#') {
      return ENTITIES[code.toLowerCase()] ?? entity;
    }
    const point =
      code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
}
