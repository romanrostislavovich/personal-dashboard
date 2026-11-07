import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  HourEvent,
  HourlyInfo,
  HourlyMetric,
  LinksHourAfter,
  LinksRhythm,
  LinksWindow,
  LocalDate,
  RhythmDays,
  zonedDateTime,
} from '@pd/contracts';
import {AiConnectionsService} from '../../ai/ai-connections.service';
import {MorningDigestService} from '../../ai/morning-digest.service';
import {DB, Database} from '../../database/database.module';
import {forEachUser} from '../../scheduler/for-each-user';
import {SchedulerService} from '../../scheduler/scheduler.service';
import {UsersService} from '../../users/users.service';
import {shift} from '../daily-series';
import {LinksService} from '../links.service';
import {linksSeen} from '../links.schema';
import {hourAfter} from './hour-after';
import {hourOf, readerOf, weekdayOf} from './local-hours';
import {inWindow, productiveWindows} from './productive-window';
import {rhythmOf} from './rhythm';

/** The productive window is of the last 90 days: the rhythm changes with work and seasons. */
const WINDOW_DAYS = 90;
/** What the sections told is reused this long: a year of every hour is a lot to read. */
const FRESH_MS = 3_600_000;
/** The deep work a day needs for "in my window" to mean anything, minutes. */
const IN_WINDOW_MINUTES = 25;
const DEEP_WORK = 'activity.hour.deepWork';

/** The kind of a `links_seen` row of a day whose deep work went into its window. */
export const IN_WINDOW_DAY = 'window';

interface Hours {
  metrics: HourlyMetric[];
  events: HourEvent[];
  from: LocalDate;
  to: LocalDate;
}

/**
 * Hours, not only days (Links v2): what the sections know hour by hour (LinksService.hours),
 * read as the day's rhythm, the hour after an event and the productive window. The days that
 * are over only: today's hours are not done.
 */
@Injectable()
export class HoursService implements OnModuleInit {
  private readonly fresh = new Map<
    string,
    {at: number; value: Promise<Hours>}
  >();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly users: UsersService,
    private readonly scheduler: SchedulerService,
    private readonly digest: MorningDigestService,
    private readonly connections: AiConnectionsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'links.in-window',
      cron: '55 4 * * *',
      handler: async () =>
        forEachUser('links.in-window', await this.users.findAll(), user =>
          this.markInWindow(user.id),
        ),
    });
    this.digest.register({
      id: 'life.window',
      module: 'life',
      description:
        "Today's productive window (Links → Rhythm): the hours (`from`–`to`, the user's own " +
        'clock) when their coding, deep work and tasks done are highest on this weekday, over ' +
        'the last 90 days, and how sure it is. Tell it in a few calm words as a hint, not an ' +
        'order ("hard tasks fit 10–12 today").',
      collect: userId => this.digestFacts(userId),
    });
  }

  /** A number by weekday and hour over the last `days` (of `key`, or the first there is). */
  async rhythm(
    userId: string,
    days: RhythmDays,
    key?: string,
    hidden: string[] = [],
  ): Promise<LinksRhythm> {
    const hours = await this.hours(userId, days, hidden);
    const metrics = [...hours.metrics].sort((a, b) =>
      a.key.localeCompare(b.key),
    );
    const metric = metrics.find(one => one.key === key) ?? metrics[0];
    return {
      from: hours.from,
      to: hours.to,
      metrics: metrics.map(infoOf),
      rhythm: metric ? rhythmOf(metric) : null,
    };
  }

  /** Every event against every hourly number, in the hour after it. */
  async hourAfter(
    userId: string,
    days: RhythmDays,
    hidden: string[] = [],
  ): Promise<LinksHourAfter> {
    const hours = await this.hours(userId, days, hidden);
    return {
      from: hours.from,
      to: hours.to,
      events: hours.events.map(
        ({hours: times, days: _days, itself: _itself, ...event}) => ({
          ...event,
          count: times.length,
        }),
      ),
      outcomes: hours.metrics.map(infoOf),
      results: hourAfter(hours.metrics, hours.events),
    };
  }

  /** The productive window of every weekday, over the last 90 days, and today's weekday. */
  async window(
    userId: string,
    hidden: string[] = [],
    now = new Date(),
  ): Promise<LinksWindow> {
    const today = await this.todayOf(userId, now);
    const hours = await this.hours(userId, WINDOW_DAYS, hidden, now);
    return {
      today,
      weekday: weekdayOf(today),
      week: productiveWindows(hours.metrics),
      metrics: hours.metrics.filter(one => one.productive).map(infoOf),
    };
  }

  /** Whether an hourly number or event of this key is one the user has (for the achievements). */
  async knows(
    userId: string,
    kind: 'rhythm' | 'after',
    key: string,
  ): Promise<boolean> {
    const hours = await this.hours(userId, WINDOW_DAYS);
    return (kind === 'rhythm' ? hours.metrics : hours.events).some(
      one => one.key === key,
    );
  }

  /** Today's window for the morning digest, when it is clear enough; the AI-hidden sections out. */
  async digestFacts(userId: string, now = new Date()): Promise<unknown> {
    const hidden = await this.connections.hiddenFromShared(userId);
    const {week, weekday} = await this.window(userId, hidden, now);
    const today = week[weekday];
    return today.sure !== 'low' && today.windows.length
      ? {windows: today.windows, sure: today.sure}
      : null;
  }

  /**
   * Yesterday kept as "in my window" when most of its deep work went into its weekday's window
   * (for the achievement): a read writes nothing, so the nightly job does it.
   */
  async markInWindow(userId: string, now = new Date()): Promise<void> {
    const today = await this.todayOf(userId, now);
    const yesterday = shift(today, -1);
    const hours = await this.hours(userId, WINDOW_DAYS, [], now);
    const deep = hours.metrics.find(one => one.key === DEEP_WORK);
    if (!deep) {
      return;
    }
    const read = readerOf(deep);
    const day = [...Array(24).keys()].map(hour =>
      read(hourOf(yesterday, hour)),
    );
    const minutes = day.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const window = productiveWindows(hours.metrics)[weekdayOf(yesterday)];
    if (minutes >= IN_WINDOW_MINUTES && inWindow(day, window)) {
      await this.db
        .insert(linksSeen)
        .values({userId, kind: IN_WINDOW_DAY, key: yesterday})
        .onConflictDoNothing();
    }
  }

  /**
   * Every section's hours of the last `days` that are over, the `hidden` sections left out;
   * what the sections told is kept an hour.
   */
  private async hours(
    userId: string,
    days: number,
    hidden: string[] = [],
    now = new Date(),
  ): Promise<Hours> {
    const timeZone = await this.timeZone(userId);
    const today = zonedDateTime(now, timeZone).date;
    const key = `${userId}|${today}|${days}`;
    for (const [old, one] of this.fresh) {
      if (now.getTime() - one.at >= FRESH_MS) {
        this.fresh.delete(old);
      }
    }
    let known = this.fresh.get(key)?.value;
    if (!known) {
      const period = {from: shift(today, -days), to: shift(today, -1)};
      known = this.links
        .hours(userId, period, timeZone)
        .then(found => ({...found, ...period}));
      this.fresh.set(key, {at: now.getTime(), value: known});
      // A failed reading is not kept: the next one asks again.
      known.catch(() => this.fresh.delete(key));
    }
    const all = await known;
    return {
      ...all,
      metrics: all.metrics.filter(one => !hidden.includes(one.module)),
      events: all.events.filter(one => !hidden.includes(one.module)),
    };
  }

  private async todayOf(userId: string, now: Date): Promise<LocalDate> {
    return zonedDateTime(now, await this.timeZone(userId)).date;
  }

  private async timeZone(userId: string): Promise<string> {
    return this.users.timeZoneOf(await this.users.findById(userId));
  }
}

function infoOf({
  key,
  module,
  labelKey,
  unit,
  productive,
}: HourlyMetric): HourlyInfo {
  return {key, module, labelKey, unit, ...(productive ? {productive} : {})};
}
