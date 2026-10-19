import { pageText, parseAiProduct, parsePrice, readProductPage } from './product-page';

const jsonLd = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

describe('parsePrice', () => {
  it('reads the ways shops write a price', () => {
    expect(parsePrice(1299.9)).toBe(1299.9);
    expect(parsePrice('1299.99')).toBe(1299.99);
    expect(parsePrice('1 299,00 zł')).toBe(1299);
    expect(parsePrice('1,299.00')).toBe(1299);
    expect(parsePrice('1.299,00')).toBe(1299);
    expect(parsePrice('$1,299')).toBe(1299);
    expect(parsePrice('12,5')).toBe(12.5);
    expect(parsePrice('1.234.567')).toBe(1234567);
  });

  it('gives nothing for what is not a price', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('free')).toBeNull();
    expect(parsePrice(0)).toBeNull();
    expect(parsePrice(null)).toBeNull();
  });
});

describe('readProductPage', () => {
  it('reads a JSON-LD product', () => {
    const html = jsonLd({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Garmin Venu 3 &amp; strap',
      image: ['https://shop.example/venu.jpg'],
      offers: { '@type': 'Offer', price: '1899.00', priceCurrency: 'pln' },
    });
    expect(readProductPage(html)).toEqual({
      name: 'Garmin Venu 3 & strap',
      price: 1899,
      currency: 'PLN',
      image: 'https://shop.example/venu.jpg',
    });
  });

  it('finds the product inside @graph and takes the cheapest offer', () => {
    const html =
      '<script type="application/ld+json">{broken</script>' +
      jsonLd({
        '@graph': [
          { '@type': 'WebPage' },
          {
            '@type': ['Product'],
            name: 'Watch',
            image: { '@type': 'ImageObject', url: 'https://shop.example/w.png' },
            offers: [
              { price: 250, priceCurrency: 'EUR' },
              { priceSpecification: { price: '199,90', priceCurrency: 'EUR' } },
            ],
          },
        ],
      });
    expect(readProductPage(html)).toMatchObject({
      price: 199.9,
      currency: 'EUR',
      image: 'https://shop.example/w.png',
    });
  });

  it('skips a product group without a price for the product next to it', () => {
    const html = jsonLd([
      { '@type': 'ProductGroup', name: 'Garmin Venu' },
      {
        '@type': 'Product',
        name: 'Garmin Venu 3 black',
        offers: { price: 1499, priceCurrency: 'PLN' },
      },
    ]);
    expect(readProductPage(html)).toMatchObject({
      name: 'Garmin Venu 3 black',
      price: 1499,
      currency: 'PLN',
    });
  });

  it('reads the low price of an aggregate offer', () => {
    const html = jsonLd({
      '@type': 'Product',
      name: 'Watch',
      offers: { '@type': 'AggregateOffer', lowPrice: 149, highPrice: 180, priceCurrency: 'USD' },
    });
    expect(readProductPage(html)).toMatchObject({ price: 149, currency: 'USD' });
  });

  it('falls back to Open Graph tags, whatever the order of the attributes', () => {
    const html = `
      <title>Shop</title>
      <meta content="Smart watch &quot;X&quot;" property="og:title">
      <meta property="og:image" content="https://shop.example/x.jpg" />
      <meta property='product:price:amount' content='349.50'>
      <meta property="product:price:currency" content="EUR">`;
    expect(readProductPage(html)).toEqual({
      name: 'Smart watch "X"',
      price: 349.5,
      currency: 'EUR',
      image: 'https://shop.example/x.jpg',
    });
  });

  it('falls back to microdata', () => {
    const html = `
      <title> A  watch </title>
      <span itemprop="price" content="99.00">99,00</span>
      <meta itemprop="priceCurrency" content="USD">`;
    expect(readProductPage(html)).toEqual({
      name: 'A watch',
      price: 99,
      currency: 'USD',
      image: null,
    });
  });

  it('gives no price for a page without one', () => {
    expect(readProductPage('<title>Are you a robot?</title>')).toEqual({
      name: 'Are you a robot?',
      price: null,
      currency: null,
      image: null,
    });
  });
});

describe('pageText', () => {
  it('leaves the text only', () => {
    const html = '<style>p{}</style><p>Watch&nbsp;X</p><script>var a = "<b>";</script> <b>99 €</b>';
    expect(pageText(html, 100)).toBe('Watch X 99 €');
    expect(pageText(html, 5)).toBe('Watch');
  });
});

describe('parseAiProduct', () => {
  it('takes a price with a currency', () => {
    expect(parseAiProduct('Here: {"price": "1 299,00", "currency": "pln"}')).toEqual({
      price: 1299,
      currency: 'PLN',
    });
  });

  it('gives nothing when the AI found no price', () => {
    expect(parseAiProduct('{"price": null, "currency": null}')).toBeNull();
    expect(parseAiProduct('{"price": 10}')).toBeNull();
    expect(parseAiProduct('no idea')).toBeNull();
  });
});
