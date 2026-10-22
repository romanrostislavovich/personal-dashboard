import { activitySiteVisitSchema, isSiteOf, siteDomainSchema, siteOf } from './activity-sites';

describe('sites', () => {
  it('counts a page by its host, without www, and nothing else by a site', () => {
    expect(siteOf('https://www.YouTube.com/watch?v=1')).toBe('youtube.com');
    expect(siteOf('http://localhost:4200/finance')).toBe('localhost:4200');
    expect(siteOf('http://127.0.0.1:3000/')).toBe('127.0.0.1:3000');
    expect(siteOf('http://localhost/')).toBe('localhost');
    // A port of a real site is not another site.
    expect(siteOf('https://example.com:8443/a')).toBe('example.com');
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

  it('takes a visit to a local address, so a batch with one still gets through', () => {
    const visit = {
      id: '0b9e8f7a-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
      startedAt: '2026-10-16T10:00:00Z',
      endedAt: '2026-10-16T10:05:00Z',
    };
    for (const url of [
      'http://localhost:4200/projects',
      'http://127.0.0.1:3000',
      'http://[::1]/',
    ]) {
      const site = siteOf(url);
      expect(activitySiteVisitSchema.safeParse({ ...visit, site }).success).toBe(true);
    }
    expect(activitySiteVisitSchema.safeParse({ ...visit, site: 'not a site' }).success).toBe(false);
  });
});
