import { z } from 'zod';

// The browser extension's part of Activity: the time on each site (the desktop app sees only
// "Chrome, 3 hours"), the sites a focus session keeps closed, and the daily limits of sites.

/**
 * The site of an address as it is counted: the host name without `www.`, lower case.
 * `null` — not a site (a browser page, a file).
 */
export function siteOf(url: string): string | null {
  try {
    const { protocol, hostname } = new URL(url);
    if ((protocol !== 'http:' && protocol !== 'https:') || !hostname) {
      return null;
    }
    return hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Whether a site is the given one or one of its subdomains: `m.youtube.com` is `youtube.com`. */
export function isSiteOf(site: string, domain: string): boolean {
  return site === domain || site.endsWith(`.${domain}`);
}

/** A domain as the user types it: `https://www.YouTube.com/feed` → `youtube.com`. */
export const siteDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(253)
  .transform((value) => siteOf(value.includes('://') ? value : `https://${value}`) ?? value)
  .pipe(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Expected a domain like youtube.com'));

/** Sites a focus session keeps closed until the user changes the list. */
export const DEFAULT_DISTRACTING_SITES = [
  'youtube.com',
  'instagram.com',
  'facebook.com',
  'x.com',
  'twitter.com',
  'reddit.com',
  'tiktok.com',
  'vk.com',
  'twitch.tv',
];

const moment = z.iso.datetime({ offset: true });

/** A stretch of time one site was in front, the browser focused and the user there. */
export const activitySiteVisitSchema = z
  .object({
    /** Made by the extension: a batch sent twice does not double the time. */
    id: z.uuid(),
    site: siteDomainSchema,
    startedAt: moment,
    endedAt: moment,
  })
  .refine((visit) => visit.endedAt > visit.startedAt, 'A visit ends after it starts');
export type ActivitySiteVisitInput = z.infer<typeof activitySiteVisitSchema>;

/** `POST /api/activity/sites`. */
export const activitySiteVisitsSchema = z.object({
  visits: z.array(activitySiteVisitSchema).max(500),
});
export type ActivitySiteVisits = z.infer<typeof activitySiteVisitsSchema>;

/** What the extension follows; asked every minute (`GET /api/activity/browser`). */
export interface ActivityBrowserConfig {
  /** Time by site is recorded (Activity settings). */
  trackSites: boolean;
  /** A focus session of a desktop app runs until then; `null` — none. */
  focusUntil: string | null;
  /** Closed while it runs. */
  distractingSites: string[];
  /** Sites with a daily limit, and how much of it today has taken already (every browser). */
  siteLimits: { site: string; minutes: number; usedSeconds: number }[];
  /** Sites never recorded: their domain has one of the private words of Activity. */
  privateWords: string[];
}

/** The time of a site in a period (`GET /api/activity/sites`), the most visited first. */
export interface ActivitySiteTime {
  site: string;
  seconds: number;
}
