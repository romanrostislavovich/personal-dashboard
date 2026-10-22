import { Inject, Injectable } from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import {
  ActivityBrowserConfig,
  ActivityPeriod,
  ActivitySiteTime,
  ActivitySiteVisitInput,
  addDays,
  isSiteOf,
  parseLocalDate,
  toLocalDate,
  zonedToUtc,
} from '@pd/contracts';
import { and, desc, eq, gt, gte, lt, sql } from 'drizzle-orm';
import {
  activityDevices,
  ActivityDeviceRow,
  activityLimits,
  activitySiteVisits,
} from './activity.schema';
import { ActivityService } from './activity.service';
import { MAX_VISIT_SECONDS } from './visit-length';

/**
 * The browser extension's part of Activity: the time on each site, the focus session it keeps
 * the distracting sites closed during, and the daily limits of sites. Only the site of a page
 * is kept — never its address or title.
 */
@Injectable()
export class SitesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly activity: ActivityService,
  ) {}

  /** Saves what the extension recorded; returns how many visits were new. */
  async record(userId: string, visits: ActivitySiteVisitInput[]): Promise<number> {
    const settings = await this.activity.settings(userId);
    if (!settings.trackSites) {
      return 0;
    }
    const rows = visits
      .filter((visit) => !isPrivate(visit.site, settings.privateWords))
      .map((visit) => {
        const startedAt = new Date(visit.startedAt);
        const seconds = Math.min(
          MAX_VISIT_SECONDS,
          Math.round((new Date(visit.endedAt).getTime() - startedAt.getTime()) / 1000),
        );
        return {
          id: visit.id,
          userId,
          site: visit.site,
          startedAt,
          endedAt: new Date(startedAt.getTime() + seconds * 1000),
          seconds,
        };
      })
      .filter((row) => row.seconds > 0);
    if (!rows.length) {
      return 0;
    }
    // An id taken by another user's visit is skipped like a repeated one: no row is overwritten.
    const saved = await this.db
      .insert(activitySiteVisits)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: activitySiteVisits.id });
    return saved.length;
  }

  /** The time of each site in a period of the user's own days, the most visited first. */
  async times(
    userId: string,
    period: Omit<ActivityPeriod, 'deviceId'>,
  ): Promise<ActivitySiteTime[]> {
    const timeZone = await this.activity.timeZone(userId);
    const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
    const seconds = sql<number>`sum(${activitySiteVisits.seconds})::int`;
    return this.db
      .select({ site: activitySiteVisits.site, seconds })
      .from(activitySiteVisits)
      .where(
        and(
          eq(activitySiteVisits.userId, userId),
          gte(
            activitySiteVisits.startedAt,
            zonedToUtc({ date: period.from, time: '00:00' }, timeZone),
          ),
          lt(activitySiteVisits.startedAt, zonedToUtc({ date: after, time: '00:00' }, timeZone)),
        ),
      )
      .groupBy(activitySiteVisits.site)
      .orderBy(desc(seconds));
  }

  /** What the extension follows: the focus session now, the sites to close, the limits. */
  async browserConfig(userId: string): Promise<ActivityBrowserConfig> {
    const settings = await this.activity.settings(userId);
    const [focus] = await this.db
      .select({ until: sql<Date | null>`max(${activityDevices.focusUntil})`.mapWith(toDate) })
      .from(activityDevices)
      .where(and(eq(activityDevices.userId, userId), gt(activityDevices.focusUntil, new Date())));
    const limits = await this.db
      .select({ site: activityLimits.app, minutes: activityLimits.minutes })
      .from(activityLimits)
      .where(and(eq(activityLimits.userId, userId), eq(activityLimits.kind, 'site')));
    const today = await this.activity.today(userId);
    const spent = limits.length ? await this.times(userId, { from: today, to: today }) : [];
    return {
      trackSites: settings.trackSites,
      focusUntil: focus?.until?.toISOString() ?? null,
      distractingSites: settings.distractingSites,
      siteLimits: limits.flatMap(({ site, minutes }) =>
        site
          ? [
              {
                site,
                minutes,
                // A limit of `youtube.com` counts `m.youtube.com` and `music.youtube.com` too.
                usedSeconds: spent
                  .filter((time) => isSiteOf(time.site, site))
                  .reduce((sum, time) => sum + time.seconds, 0),
              },
            ]
          : [],
      ),
      privateWords: settings.privateWords,
    };
  }

  /** The desktop app tells whether its focus session runs, with every upload. */
  async setFocus(device: ActivityDeviceRow, until: string | null): Promise<void> {
    await this.db
      .update(activityDevices)
      .set({ focusUntil: until ? new Date(until) : null })
      .where(eq(activityDevices.id, device.id));
  }
}

/** A site whose domain has one of the private words (a bank, a clinic) is never kept. */
function isPrivate(site: string, privateWords: string[]): boolean {
  return privateWords.some((word) => site.includes(word.toLowerCase()));
}

function toDate(value: unknown): Date | null {
  return value ? new Date(value as string) : null;
}
