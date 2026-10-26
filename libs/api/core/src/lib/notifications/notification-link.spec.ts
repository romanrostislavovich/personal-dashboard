import { linkOf } from './notification-link';

describe('where a tap on a notification leads', () => {
  it('to the page the module named', () => {
    expect(linkOf({ source: 'tasks', link: '/tasks?task=1' })).toBe('/tasks?task=1');
  });

  it("to its section's page, a service inside a section to that section", () => {
    expect(linkOf({ source: 'finance' })).toBe('/finance');
    expect(linkOf({ source: 'bank' })).toBe('/finance');
    expect(linkOf({ source: 'lastfm' })).toBe('/music');
    expect(linkOf({ source: 'desktop' })).toBe('/activity');
  });

  it("the dashboard's own messages to their settings, anything else home", () => {
    expect(linkOf({ source: 'integrations' })).toBe('/settings?tab=integrations');
    expect(linkOf({ source: 'backup' })).toBe('/settings?tab=data');
    expect(linkOf({ source: 'core' })).toBe('/');
    expect(linkOf({ source: 'manual' })).toBe('/');
  });
});
