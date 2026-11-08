import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  DailyMetric,
  LinksOverload,
  LocalDate,
  OverloadPart,
  zonedDateTime,
} from '@pd/contracts';
import {and, desc, eq, gte, inArray} from 'drizzle-orm';
import {DB, Database} from '../../database/database.module';
import {NotificationsService} from '../../notifications/notifications.service';
import {forEachUser} from '../../scheduler/for-each-user';
import {SchedulerService} from '../../scheduler/scheduler.service';
import {UsersService} from '../../users/users.service';
import {shift} from '../daily-series';
import {LinksService} from '../links.service';
import {linksSeen, linksSettings} from '../links.schema';
import {overloadBody, overloadMessages} from './overload.messages';
import {
  overloadHistory,
  overloadOn,
  OVERLOAD_SIGNALS,
  overloadThreshold,
  RECENT_DAYS,
} from './overload';

/** The history the user's own high is taken from, and the days the page draws. */
const HISTORY_DAYS = 120;
const SHOWN_DAYS = 60;
/** The last week is not part of "usual" when the high is found. */
const RECENT_LEFT_OUT = 7;
/** At most one warning in this many days. */
const WARN_EVERY_DAYS = 3;
/** Sent in the day, not at night: from this hour of the user's own clock, until this one. */
const SEND_FROM_HOUR = 10;
const SEND_UNTIL_HOUR = 21;
/** Back to well: a score this far below the high, within this many days of a warning. */
const RECOVERED_SHARE = 0.5;
const RECOVERY_DAYS = 14;
/** The numbers of the score read this far back (the usual of the first scored day too). */
const READ_DAYS = HISTORY_DAYS + RECENT_DAYS + 28;
/** The sections its numbers come from: only these are read. */
const SECTIONS = [
  ...new Set(OVERLOAD_SIGNALS.map(signal => signal.key.split('.')[0])),
];
/** The scores of a day are reused this long: the page and Home ask often. */
const FRESH_MS = 3_600_000;
/** The kinds of `links_seen` rows: a warning sent (by its day), and well again after it. */
export const OVERLOAD_WARNED = 'overload';
export const OVERLOAD_RECOVERED = 'recovered';

/**
 * The overload warning (Links v2): the last days that are over against the user's own usual
 * (see overload.ts); above their own high, one gentle message — Telegram, the phone, the
 * computer, waiting for the end of the quiet hours — with what pulls most and one small step,
 * at most once in three days, switchable. Back to well after one is kept, for the achievement.
 */
@Injectable()
export class OverloadService implements OnModuleInit {
  /** The day each user was looked at by the job: once a day is enough. */
  private readonly looked = new Map<string, LocalDate>();
  /** The scored days of a user (`user|day|hidden`), kept an hour. */
  private readonly fresh = new Map<
    string,
    {at: number; value: Promise<Omit<LinksOverload, 'enabled' | 'lastWarned'>>}
  >();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly users: UsersService,
    private readonly scheduler: SchedulerService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'links.overload',
      cron: '45 * * * *',
      handler: async () =>
        forEachUser('links.overload', await this.users.findAll(), user =>
          this.checkDue(user.id),
        ),
    });
  }

  /** The score of the last days that are over, the user's own high, and the 60 days before. */
  async status(
    userId: string,
    hidden: string[] = [],
    now = new Date(),
  ): Promise<LinksOverload> {
    const today = zonedDateTime(now, await this.timeZone(userId)).date;
    const [settings] = await this.db
      .select({enabled: linksSettings.overloadEnabled})
      .from(linksSettings)
      .where(eq(linksSettings.userId, userId));
    return {
      ...(await this.scored(userId, shift(today, -1), hidden, now)),
      enabled: settings?.enabled ?? true,
      lastWarned: await this.lastWarned(userId),
    };
  }

  /** The score of the day and its history, of the score's own sections only; kept an hour. */
  private scored(
    userId: string,
    day: LocalDate,
    hidden: string[],
    now: Date,
  ): Promise<Omit<LinksOverload, 'enabled' | 'lastWarned'>> {
    const key = [userId, day, ...[...hidden].sort()].join('|');
    for (const [old, one] of this.fresh) {
      if (now.getTime() - one.at >= FRESH_MS) {
        this.fresh.delete(old);
      }
    }
    const kept = this.fresh.get(key);
    if (kept) {
      return kept.value;
    }
    const value = (async () => {
      const metrics = (
        await this.links.dailyMetrics(
          userId,
          {from: shift(day, -READ_DAYS), to: day},
          SECTIONS,
        )
      ).filter(metric => !hidden.includes(metric.module));
      const history = overloadHistory(metrics, shift(day, -HISTORY_DAYS), day);
      const threshold = overloadThreshold(
        history.slice(0, -RECENT_LEFT_OUT).map(one => one.score),
      );
      const found = overloadOn(metrics, day);
      return {
        day,
        score: found?.score ?? null,
        threshold,
        high: found !== null && threshold !== null && found.score > threshold,
        parts: (found?.parts ?? []).map(part => namedPart(part, metrics)),
        history: history.slice(-SHOWN_DAYS),
      };
    })();
    this.fresh.set(key, {at: now.getTime(), value});
    // A failed reading is not kept: the next one asks again.
    value.catch(() => this.fresh.delete(key));
    return value;
  }

  /** The day of the last warning sent (its `links_seen` row). */
  private async lastWarned(userId: string): Promise<LocalDate | null> {
    const [row] = await this.db
      .select({key: linksSeen.key})
      .from(linksSeen)
      .where(
        and(eq(linksSeen.userId, userId), eq(linksSeen.kind, OVERLOAD_WARNED)),
      )
      .orderBy(desc(linksSeen.key))
      .limit(1);
    return row?.key ?? null;
  }

  async setEnabled(userId: string, enabled: boolean): Promise<void> {
    await this.db
      .insert(linksSettings)
      .values({userId, overloadEnabled: enabled})
      .onConflictDoUpdate({
        target: linksSettings.userId,
        set: {overloadEnabled: enabled},
      });
  }

  /** How many times the user was well again after a warning (for the achievement). */
  async recoveries(userId: string): Promise<number> {
    return this.db.$count(
      linksSeen,
      and(eq(linksSeen.userId, userId), eq(linksSeen.kind, OVERLOAD_RECOVERED)),
    );
  }

  /**
   * The job's, once a day in the user's day hours: the warning when the score is above their
   * high (and they have not switched it off, nor got one in the last three days), and "well
   * again" after a recent one.
   */
  async checkDue(userId: string, now = new Date()): Promise<void> {
    const user = await this.users.findById(userId);
    const local = zonedDateTime(now, this.users.timeZoneOf(user));
    const hour = Number(local.time.slice(0, 2));
    if (
      hour < SEND_FROM_HOUR ||
      hour >= SEND_UNTIL_HOUR ||
      this.looked.get(userId) === local.date
    ) {
      return;
    }
    this.looked.set(userId, local.date);
    const status = await this.status(
      userId,
      this.users.hiddenSections(user),
      now,
    );
    await this.markRecovered(userId, status, local.date);
    const due =
      !status.lastWarned ||
      status.lastWarned <= shift(local.date, -WARN_EVERY_DAYS);
    if (!status.high || !status.enabled || !due) {
      return;
    }
    // Marked first: whatever happens next, one attempt a day.
    await this.db
      .insert(linksSeen)
      .values({userId, kind: OVERLOAD_WARNED, key: local.date})
      .onConflictDoNothing();
    await this.notifications.send(userId, {
      title: overloadMessages(user?.locale).title,
      body: overloadBody(
        user?.locale,
        status.parts.filter(part => part.weight > 0).map(part => part.key),
      ),
      source: 'life',
      link: '/life/links',
    });
  }

  /** A recent warning followed by a calm score: well again (once for each warning). */
  private async markRecovered(
    userId: string,
    status: LinksOverload,
    today: LocalDate,
  ): Promise<void> {
    if (status.score === null || status.threshold === null) {
      return;
    }
    if (status.score > status.threshold * RECOVERED_SHARE) {
      return;
    }
    const seen = await this.db
      .select({kind: linksSeen.kind, key: linksSeen.key})
      .from(linksSeen)
      .where(
        and(
          eq(linksSeen.userId, userId),
          inArray(linksSeen.kind, [OVERLOAD_WARNED, OVERLOAD_RECOVERED]),
          gte(linksSeen.key, shift(today, -RECOVERY_DAYS)),
        ),
      );
    const recovered = new Set(
      seen.filter(one => one.kind === OVERLOAD_RECOVERED).map(one => one.key),
    );
    const warnings = seen.filter(
      one =>
        one.kind === OVERLOAD_WARNED &&
        one.key < today &&
        !recovered.has(one.key),
    );
    for (const warning of warnings) {
      await this.db
        .insert(linksSeen)
        .values({userId, kind: OVERLOAD_RECOVERED, key: warning.key})
        .onConflictDoNothing();
    }
  }

  private async timeZone(userId: string): Promise<string> {
    return this.users.timeZoneOf(await this.users.findById(userId));
  }
}

function namedPart(
  part: {key: string; recent: number; usual: number; weight: number},
  metrics: DailyMetric[],
): OverloadPart {
  const metric = metrics.find(one => one.key === part.key);
  return {
    ...part,
    module: metric?.module ?? part.key.split('.')[0],
    labelKey: metric?.labelKey ?? part.key,
    ...(metric?.label ? {label: metric.label} : {}),
    unit: metric?.unit ?? 'count',
  };
}
