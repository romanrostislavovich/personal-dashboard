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

  /** Tomorrow's chance of every habit with lapses; `hidden` sections left out. */
  async lapses(
    userId: string,
    hidden: string[] = [],
    now = new Date(),
  ): Promise<LinksLapses> {
    const today = await this.todayOf(userId, now);
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

  /**
   * The likely lapses of tomorrow for the evening summary, each kept as told (for "kept after
   * all" the day after); the sections the user hid are left out.
   */
  async tellTomorrow(userId: string, now = new Date()): Promise<HabitLapse[]> {
    const user = await this.users.findById(userId);
    const {day, habits} = await this.lapses(
      userId,
      this.users.hiddenSections(user),
      now,
    );
    const high = habits.filter(habit => habit.high);
    if (high.length) {
      await this.db
        .insert(linksSeen)
        .values(
          high.map(habit => ({
            userId,
            kind: LAPSE_TOLD,
            key: `${habit.key}|${day}`,
          })),
        )
        .onConflictDoNothing();
    }
    return high;
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
        row.key.slice(-10) < today &&
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

/** Whether a habit lapsed on a day (unknown — not a lapse to count). */
function lapsedOn(habit: DailyMetric, day: LocalDate): boolean {
  const value = seriesOf(habit, [day]).get(day);
  if (value === undefined) {
    return true;
  }
  return habit.lapse === 'marked' ? value > 0 : value <= 0;
}
