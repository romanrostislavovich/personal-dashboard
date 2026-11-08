import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  DailyMetric,
  HabitLapse,
  LinksLapses,
  LocalDate,
  zonedDateTime,
} from '@pd/contracts';
import {and, eq, inArray} from 'drizzle-orm';
import {DB, Database} from '../../database/database.module';
import {forEachUser} from '../../scheduler/for-each-user';
import {SchedulerService} from '../../scheduler/scheduler.service';
import {UsersService} from '../../users/users.service';
import {seriesOf, shift} from '../daily-series';
import {LinksService} from '../links.service';
import {linksSeen} from '../links.schema';
import {lapseChance} from './lapse';

/** The model learns from a year. */
const HISTORY_DAYS = 365;
/** The chances of a day are reused this long: the Habits page asks on every visit. */
const FRESH_MS = 3_600_000;
/** A day's habit is looked at two days after it: a lapse is often marked the day after. */
const KEPT_AFTER_DAYS = 2;
/** The kinds of `links_seen` rows: a risk told in the evening (`habit|day`), and kept after it. */
export const LAPSE_TOLD = 'risk';
export const LAPSE_KEPT = 'kept';

/**
 * The habit lapse risk (Links v2): tomorrow's chance each habit lapses, from the day's numbers
 * (see lapse.ts). The evening summary tells the likely ones — gently, a nudge, not a scolding —
 * and a habit kept the day after one is kept for the achievement.
 */
@Injectable()
export class LapseService implements OnModuleInit {
  private readonly fresh = new Map<
    string,
    {at: number; value: Promise<LinksLapses>}
  >();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly users: UsersService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    // In the morning the day of a risk told is over: was the habit kept?
    this.scheduler.register({
      name: 'links.lapse-kept',
      cron: '15 6 * * *',
      handler: async () =>
        forEachUser('links.lapse-kept', await this.users.findAll(), user =>
          this.markKept(user.id),
        ),
    });
  }

  /** Tomorrow's chance of every habit with lapses; `hidden` sections left out; kept an hour. */
  async lapses(
    userId: string,
    hidden: string[] = [],
    now = new Date(),
  ): Promise<LinksLapses> {
    const today = await this.todayOf(userId, now);
    const key = [userId, today, ...[...hidden].sort()].join('|');
    for (const [old, one] of this.fresh) {
      if (now.getTime() - one.at >= FRESH_MS) {
        this.fresh.delete(old);
      }
    }
    const kept = this.fresh.get(key);
    if (kept) {
      return kept.value;
    }
    const value = this.count(userId, today, hidden);
    this.fresh.set(key, {at: now.getTime(), value});
    value.catch(() => this.fresh.delete(key));
    return value;
  }

  private async count(
    userId: string,
    today: LocalDate,
    hidden: string[],
  ): Promise<LinksLapses> {
    // Only a user with habits pays for reading a year of every number.
    const habits = (
      await this.links.dailyMetrics(
        userId,
        {from: shift(today, -1), to: today},
        ['habits'],
      )
    ).filter(metric => metric.lapse && !hidden.includes(metric.module));
    if (!habits.length) {
      return {day: shift(today, 1), habits: []};
    }
    const metrics = (
      await this.links.dailyMetrics(userId, {
        from: shift(today, -HISTORY_DAYS),
        to: today,
      })
    ).filter(metric => !hidden.includes(metric.module) && !metric.extra);
    const named = new Map(metrics.map(metric => [metric.key, metric]));
    return {
      day: shift(today, 1),
      habits: metrics
        .filter(metric => metric.lapse)
        .map(habit => {
          const found = lapseChance(
            metrics,
            habit,
            habit.lapse as 'marked' | 'unmarked',
            today,
          );
          return {
            ...found,
            labelKey: habit.labelKey,
            ...(habit.label ? {label: habit.label} : {}),
            drivers: found.drivers.map(driver => {
              const metric = named.get(driver.key);
              return {
                ...driver,
                labelKey: metric?.labelKey ?? `life.lapse.${driver.key}`,
                ...(metric?.label ? {label: metric.label} : {}),
              };
            }),
          };
        }),
    };
  }

  /** The likely lapses of tomorrow for the evening summary; the sections the user hid out. */
  async likelyTomorrow(
    userId: string,
    now = new Date(),
  ): Promise<{day: LocalDate; habits: HabitLapse[]}> {
    const user = await this.users.findById(userId);
    const {day, habits} = await this.lapses(
      userId,
      this.users.hiddenSections(user),
      now,
    );
    return {day, habits: habits.filter(habit => habit.high)};
  }

  /**
   * The likely lapses as told — called once the summary that tells them is sent, so "kept after
   * all" counts only what the user heard.
   */
  async markTold(
    userId: string,
    day: LocalDate,
    habits: HabitLapse[],
  ): Promise<void> {
    if (habits.length) {
      await this.db
        .insert(linksSeen)
        .values(
          habits.map(habit => ({
            userId,
            kind: LAPSE_TOLD,
            key: `${habit.key}|${day}`,
          })),
        )
        .onConflictDoNothing();
    }
  }

  /** How many likely lapses the user kept from (for the achievement). */
  async kept(userId: string): Promise<number> {
    return this.db.$count(
      linksSeen,
      and(eq(linksSeen.userId, userId), eq(linksSeen.kind, LAPSE_KEPT)),
    );
  }

  /** Each risk told of a day now over: kept when the habit did not lapse that day. */
  async markKept(userId: string, now = new Date()): Promise<void> {
    const today = await this.todayOf(userId, now);
    const rows = await this.db
      .select({kind: linksSeen.kind, key: linksSeen.key})
      .from(linksSeen)
      .where(
        and(
          eq(linksSeen.userId, userId),
          inArray(linksSeen.kind, [LAPSE_TOLD, LAPSE_KEPT]),
        ),
      );
    const done = new Set(
      rows.filter(row => row.kind === LAPSE_KEPT).map(row => row.key),
    );
    const open = rows.filter(
      row =>
        row.kind === LAPSE_TOLD &&
        !done.has(row.key) &&
        row.key.slice(-10) <= shift(today, -KEPT_AFTER_DAYS) &&
        row.key.slice(-10) >= shift(today, -7),
    );
    if (!open.length) {
      return;
    }
    const days = open.map(row => row.key.slice(-10)).sort();
    const metrics = await this.links.dailyMetrics(userId, {
      from: days[0],
      to: days[days.length - 1],
    });
    for (const row of open) {
      const [key, day] = [row.key.slice(0, -11), row.key.slice(-10)];
      const habit = metrics.find(one => one.key === key);
      if (habit?.lapse && !lapsedOn(habit, day)) {
        await this.db
          .insert(linksSeen)
          .values({userId, kind: LAPSE_KEPT, key: row.key})
          .onConflictDoNothing();
      }
    }
  }

  private async todayOf(userId: string, now: Date): Promise<LocalDate> {
    return zonedDateTime(
      now,
      this.users.timeZoneOf(await this.users.findById(userId)),
    ).date;
  }
}

/** Whether a habit lapsed on a day; a day not known counts as a lapse (never a "kept"). */
function lapsedOn(habit: DailyMetric, day: LocalDate): boolean {
  const value = seriesOf(habit, [day]).get(day);
  if (value === undefined) {
    return true;
  }
  return habit.lapse === 'marked' ? value > 0 : value <= 0;
}
