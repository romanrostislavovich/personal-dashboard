import { ActivityBrowserConfig, isSiteOf } from '@pd/contracts';

/** A stretch of time one site was in front, waiting to be sent. */
export interface Visit {
  id: string;
  site: string;
  startedAt: string;
  endedAt: string;
}

/** Why a site is closed now, for the page shown instead of it. */
export type BlockReason =
  { reason: 'focus'; until: string } | { reason: 'limit'; minutes: number; usedSeconds: number };

/** The local date of a moment (`YYYY-MM-DD`), as the user's day. */
export function localDay(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** Seconds on a site (its subdomains too) today that the server does not know of yet. */
export function unsentSeconds(visits: Visit[], domain: string, now: Date): number {
  const today = localDay(now);
  return visits
    .filter(
      (visit) => isSiteOf(visit.site, domain) && localDay(new Date(visit.startedAt)) === today,
    )
    .reduce(
      (sum, visit) =>
        sum + (new Date(visit.endedAt).getTime() - new Date(visit.startedAt).getTime()) / 1000,
      0,
    );
}

/**
 * Whether the site is to be closed now: a focus session of the desktop app runs and the site
 * distracts, or its daily limit is spent. `passes` — sites opened anyway, until when.
 */
export function blockReason(
  config: ActivityBrowserConfig,
  site: string,
  now: Date,
  unsent: Visit[],
  passes: Record<string, number>,
): BlockReason | null {
  const passed = Object.entries(passes).some(
    ([domain, until]) => until > now.getTime() && isSiteOf(site, domain),
  );
  if (passed) {
    return null;
  }
  if (
    config.focusUntil &&
    new Date(config.focusUntil) > now &&
    config.distractingSites.some((domain) => isSiteOf(site, domain))
  ) {
    return { reason: 'focus', until: config.focusUntil };
  }
  for (const limit of config.siteLimits) {
    if (!isSiteOf(site, limit.site)) {
      continue;
    }
    const usedSeconds = limit.usedSeconds + unsentSeconds(unsent, limit.site, now);
    if (usedSeconds >= limit.minutes * 60) {
      return { reason: 'limit', minutes: limit.minutes, usedSeconds };
    }
  }
  return null;
}

/** A site whose domain has one of the private words of Activity is never recorded. */
export function isPrivateSite(site: string, privateWords: string[]): boolean {
  return privateWords.some((word) => site.includes(word.toLowerCase()));
}
