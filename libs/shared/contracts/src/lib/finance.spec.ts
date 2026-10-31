import {siteOnTheInternet, wishInputSchema, wishSiteNotFound} from './finance';

describe('a wish link', () => {
  it('is a site with a domain', () => {
    expect(siteOnTheInternet('https://allegro.pl/oferta/1')).toBe(true);
    expect(siteOnTheInternet('https://www.ceneo.pl:443/1?x=y')).toBe(true);
    expect(siteOnTheInternet('https://go')).toBe(false);
    expect(siteOnTheInternet('https://localhost/x')).toBe(false);
  });

  it('is turned away by the schema when cut short', () => {
    expect(wishInputSchema.safeParse({url: 'https://go'}).success).toBe(false);
    expect(
      wishInputSchema.safeParse({url: 'https://allegro.pl/oferta/1'}).success,
    ).toBe(true);
    expect(wishInputSchema.safeParse({url: null, name: 'Книга'}).success).toBe(
      true,
    );
  });

  it('tells a site not found from a page without a price', () => {
    expect(wishSiteNotFound('EAI_AGAIN')).toBe(true);
    expect(wishSiteNotFound('ENOTFOUND')).toBe(true);
    expect(wishSiteNotFound('HTTP 403')).toBe(false);
    expect(wishSiteNotFound(null)).toBe(false);
  });
});
