import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  DailyMetric,
  LinksChange,
  LinksChanges,
  LinksSeen,
  zonedDateTime,
} from '@pd/contracts';
import {and, count, eq, gte, inArray, isNotNull} from 'drizzle-orm';
import {DB, Database} from '../database/database.module';
import {coreMessages} from '../i18n/core.messages';
import {NotificationsService} from '../notifications/notifications.service';
import {forEachUser} from '../scheduler/for-each-user';
import {SchedulerService} from '../scheduler/scheduler.service';
import {UsersService} from '../users/users.service';
import {ChangePoint, changePoints} from './change-points';
import {shift} from './daily-series';
import {LinksService} from './links.service';
import {linksChangePoints, linksSeen} from './links.schema';

/** The whole history: ten years at most. */
const HISTORY_DAYS = 3650;
/** A change this many days old or newer is fresh: worth a message. */
const FRESH_DAYS = 28;
/** One message at most in this many days. */
const MESSAGE_EVERY_DAYS = 7;
/** A change found again a few days off is the same change (its message is not sent again). */
const SAME_WITHIN_DAYS = 7;
/** What else changed "around then": within this many days. */
const NEAR_DAYS = 7;
const DAY_MS = 86_400_000;

type Row = typeof linksChangePoints.$inferSelect;

/**
 * "What changed": the change points of every number over the whole history (see changePoints),
 * searched by a nightly job and kept; one calm message about the fresh changes of the main
 * numbers, at most once a week.
 */
@Injectable()
export class ChangePointsService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'links.change-points',
      cron: '50 4 * * *',
      handler: async () =>
        forEachUser('links.change-points', await this.users.findAll(), user =>
          this.refresh(user.id),
        ),
    });
  }

  /** Searches the whole history again, keeps what it found, tells of the fresh changes. */
  async refresh(userId: string, now = new Date()): Promise<void> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    const today = zonedDateTime(now, timeZone).date;
    // The days that are over: today's level is not known yet.
    const period = {from: shift(today, -HISTORY_DAYS), to: shift(today, -1)};
    const metrics = await this.links.dailyMetrics(userId, period);
    const found = changePoints(metrics, period);
    const kept = await this.keep(userId, metrics, found);
    await this.tell(userId, kept, today, now);
  }

  async list(userId: string, hidden: string[] = []): Promise<LinksChanges> {
    const rows = (
      await this.db
        .select()
        .from(linksChangePoints)
        .where(eq(linksChangePoints.userId, userId))
    ).filter(row => !hidden.includes(row.module));
    rows.sort((a, b) => b.day.localeCompare(a.day) || b.effect - a.effect);
    return {changes: rows.map(row => toChange(row, rows))};
  }

  /** Marks something of Links as opened (for the achievements); twice is once. */
  async seen(userId: string, item: LinksSeen): Promise<void> {
    await this.db
      .insert(linksSeen)
      .values({userId, kind: item.kind, key: item.key})
      .onConflictDoNothing();
  }

  /** How many things of a kind the user has opened. */
  async seenCount(userId: string, kind: LinksSeen['kind']): Promise<number> {
    const [row] = await this.db
      .select({value: count()})
      .from(linksSeen)
      .where(and(eq(linksSeen.userId, userId), eq(linksSeen.kind, kind)));
    return row?.value ?? 0;
  }

  /**
   * Writes what was found: a change found again within a few days of a kept one updates it (its
   * id and its message stay), a new one is added, one no longer found goes.
   */
  private async keep(
    userId: string,
    metrics: DailyMetric[],
    found: ChangePoint[],
  ): Promise<Row[]> {
    const old = await this.db
      .select()
      .from(linksChangePoints)
      .where(eq(linksChangePoints.userId, userId));
    const byKey = new Map(metrics.map(metric => [metric.key, metric]));
    const left = new Set(old);
    const kept: Row[] = [];
    for (const change of found) {
      const metric = byKey.get(change.key);
      if (!metric) {
        continue;
      }
      const same = old.find(
        row =>
          left.has(row) &&
          row.key === change.key &&
          daysBetween(row.day, change.day) <= SAME_WITHIN_DAYS,
      );
      const values = {
        key: change.key,
        module: metric.module,
        labelKey: metric.labelKey,
        label: metric.label ?? null,
        unit: metric.unit,
        currency: metric.currency ?? null,
        extra: Boolean(metric.extra),
        outcome: Boolean(metric.outcome),
        day: change.day,
        before: change.before,
        after: change.after,
        effect: change.effect,
      };
      if (same) {
        left.delete(same);
        const [row] = await this.db
          .update(linksChangePoints)
          .set(values)
          .where(eq(linksChangePoints.id, same.id))
          .returning();
        kept.push(row);
      } else {
        const [row] = await this.db
          .insert(linksChangePoints)
          .values({userId, ...values})
          .onConflictDoNothing()
          .returning();
        if (row) {
          kept.push(row);
        }
      }
    }
    const gone = [...left].map(row => row.id);
    if (gone.length) {
      await this.db
        .delete(linksChangePoints)
        .where(
          and(
            eq(linksChangePoints.userId, userId),
            inArray(linksChangePoints.id, gone),
          ),
        );
    }
    return kept;
  }

  /**
   * One message about the fresh changes of the main numbers not told of yet — not when one was
   * sent within the week; those it tells of are marked, so they are not told again.
   */
  private async tell(
    userId: string,
    kept: Row[],
    today: string,
    now: Date,
  ): Promise<void> {
    const fresh = kept.filter(
      row =>
        !row.extra && !row.notifiedAt && row.day >= shift(today, -FRESH_DAYS),
    );
    if (!fresh.length) {
      return;
    }
    const [recent] = await this.db
      .select({value: count()})
      .from(linksChangePoints)
      .where(
        and(
          eq(linksChangePoints.userId, userId),
          isNotNull(linksChangePoints.notifiedAt),
          gte(
            linksChangePoints.notifiedAt,
            new Date(now.getTime() - MESSAGE_EVERY_DAYS * DAY_MS),
          ),
        ),
      );
    if (recent && recent.value > 0) {
      return;
    }
    const texts = coreMessages((await this.users.findById(userId))?.locale);
    await this.notifications.send(userId, {
      title: texts.changesTitle,
      body: texts.changesBody(fresh.length),
      source: 'life',
      link: '/life/links',
    });
    await this.db
      .update(linksChangePoints)
      .set({notifiedAt: now})
      .where(
        and(
          eq(linksChangePoints.userId, userId),
          inArray(
            linksChangePoints.id,
            fresh.map(row => row.id),
          ),
        ),
      );
  }
}

function toChange(row: Row, all: Row[]): LinksChange {
  return {
    id: row.id,
    key: row.key,
    module: row.module,
    labelKey: row.labelKey,
    ...(row.label ? {label: row.label} : {}),
    unit: row.unit as LinksChange['unit'],
    ...(row.currency ? {currency: row.currency} : {}),
    ...(row.extra ? {extra: true as const} : {}),
    ...(row.outcome ? {outcome: true as const} : {}),
    day: row.day,
    before: row.before,
    after: row.after,
    effect: row.effect,
    near: all
      .filter(
        other =>
          other.id !== row.id &&
          other.key !== row.key &&
          daysBetween(other.day, row.day) <= NEAR_DAYS,
      )
      .map(other => other.id),
  };
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS;
}
