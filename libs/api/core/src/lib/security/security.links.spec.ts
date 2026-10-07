import { isAbout } from './security.links';

const project = {
  name: 'Shop',
  url: 'https://shop.example.com/app',
  aliases: ['roma/shop-api'],
};
const finding = (details: string, key = 'code:x') => ({ key, title: 'A problem', details });

describe('isAbout', () => {
  it('knows a finding by the repository, the name or the host of the site', () => {
    expect(isAbout(finding('roma/shop-api has no branch protection'), project)).toBe(true);
    expect(isAbout(finding('Headers are missing on shop.example.com'), project)).toBe(true);
    expect(isAbout(finding('x', 'code:Roma/Shop-API:secrets'), project)).toBe(true);
  });

  it('leaves the findings about something else', () => {
    expect(isAbout(finding('SSH accepts passwords'), project)).toBe(false);
  });

  it('does not match by a name too short to mean anything', () => {
    expect(isAbout(finding('the api is open'), { name: 'api', url: null, aliases: [] })).toBe(
      false,
    );
  });
});
