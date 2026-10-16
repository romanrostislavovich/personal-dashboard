import { activitySiteVisitSchema, isSiteOf, siteDomainSchema, siteOf } from './activity-sites';

describe('sites', () => {
  it('counts a page by its host, without www, and nothing else by a site', () => {
    expect(siteOf('https://www.YouTube.com/watch?v=1')).toBe('youtube.com');
    expect(siteOf('http://localhost:4200/finance')).toBe('localhost');
    expect(siteOf('chrome://extensions')).toBeNull();
    expect(siteOf('file:///C:/a.pdf')).toBeNull();
    expect(siteOf('not a url')).toBeNull();
  });

  it('takes a subdomain for its site, never a look-alike', () => {
    expect(isSiteOf('m.youtube.com', 'youtube.com')).toBe(true);
    expect(isSiteOf('youtube.com', 'youtube.com')).toBe(true);
    expect(isSiteOf('notyoutube.com', 'youtube.com')).toBe(false);
  });

  it('reads a domain as the user types it', () => {
    expect(siteDomainSchema.parse(' https://www.Reddit.com/r/all ')).toBe('reddit.com');
    expect(siteDomainSchema.parse('twitch.tv')).toBe('twitch.tv');
    expect(siteDomainSchema.safeParse('not a site').success).toBe(false);
  });

  it('refuses a visit that ends before it starts', () => {
    const visit = {
      id: '0b9e8f7a-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
      site: 'youtube.com',
      startedAt: '2026-10-16T10:00:00Z',
      endedAt: '2026-10-16T09:00:00Z',
    };
    expect(activitySiteVisitSchema.safeParse(visit).success).toBe(false);
    expect(
      activitySiteVisitSchema.safeParse({ ...visit, endedAt: '2026-10-16T10:05:00Z' }).success,
    ).toBe(true);
  });
});
