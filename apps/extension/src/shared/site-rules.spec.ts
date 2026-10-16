import { ActivityBrowserConfig } from '@pd/contracts';
import { blockReason, isPrivateSite, localDay, unsentSeconds, Visit } from './site-rules';

const now = new Date(2026, 9, 16, 15, 0);
const config: ActivityBrowserConfig = {
  trackSites: true,
  focusUntil: null,
  distractingSites: ['youtube.com', 'reddit.com'],
  siteLimits: [{ site: 'youtube.com', minutes: 30, usedSeconds: 20 * 60 }],
  privateWords: ['bank'],
};
const visit = (site: string, start: Date, minutes: number): Visit => ({
  id: `${site}-${start.getTime()}`,
  site,
  startedAt: start.toISOString(),
  endedAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
});

describe('site rules', () => {
  it('closes a distracting site while a focus session runs, and only then', () => {
    const focus = { ...config, focusUntil: new Date(now.getTime() + 600_000).toISOString() };
    expect(blockReason(focus, 'm.youtube.com', now, [], {})).toEqual({
      reason: 'focus',
      until: focus.focusUntil,
    });
    expect(blockReason(focus, 'github.com', now, [], {})).toBeNull();
    const ended = { ...config, focusUntil: new Date(now.getTime() - 1000).toISOString() };
    expect(blockReason(ended, 'reddit.com', now, [], {})).toBeNull();
  });

  it('counts what is not sent yet to the limit, today only', () => {
    const yesterday = new Date(2026, 9, 15, 15, 0);
    const unsent = [visit('youtube.com', yesterday, 60), visit('youtube.com', now, 5)];
    expect(unsentSeconds(unsent, 'youtube.com', now)).toBe(300);
    expect(blockReason(config, 'youtube.com', now, unsent, {})).toBeNull();
    const more = [...unsent, visit('music.youtube.com', now, 5)];
    expect(blockReason(config, 'youtube.com', now, more, {})).toEqual({
      reason: 'limit',
      minutes: 30,
      usedSeconds: 30 * 60,
    });
  });

  it('lets a site in while its pass lasts', () => {
    const focus = { ...config, focusUntil: new Date(now.getTime() + 600_000).toISOString() };
    const passes = { 'youtube.com': now.getTime() + 60_000 };
    expect(blockReason(focus, 'youtube.com', now, [], passes)).toBeNull();
    expect(
      blockReason(focus, 'youtube.com', now, [], { 'youtube.com': now.getTime() - 1 }),
    ).not.toBeNull();
  });

  it('knows a private site and the local day', () => {
    expect(isPrivateSite('online.mybank.pl', ['Bank'])).toBe(true);
    expect(isPrivateSite('github.com', ['bank'])).toBe(false);
    expect(localDay(now)).toBe('2026-10-16');
  });
});
