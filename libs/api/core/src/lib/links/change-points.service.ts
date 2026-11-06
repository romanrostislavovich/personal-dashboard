import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  DailyMetric,
  LinksChange,
  LinksChanges,
  LinksSeen,
  zonedDateTime,
} from '@pd/contracts';
import {and, count, eq, inArray} from 'drizzle-orm';
import {AiConnectionsService} from '../ai/ai-connections.service';
import {MorningDigestService} from '../ai/morning-digest.service';
import {DB, Database} from '../database/database.module';
import {forEachUser} from '../scheduler/for-each-user';
import {SchedulerService} from '../scheduler/scheduler.service';
import {UsersService} from '../users/users.service';
import {ChangePoint, changePoints, MIN_SEGMENT} from './change-points';
import {seriesOf, shift} from './daily-series';
import {unusualOn} from './unusual';
import {LinksService} from './links.service';
import {linksChangePoints, linksSeen} from './links.schema';

/**
 * The history searched: three years. Enough to see a level change; ten years of every number
 * for every user would make the nightly job slow on a small server.
 */
const HISTORY_DAYS = 1095;
/** A change this many days old or newer is fresh: worth telling in the morning digest. */
const FRESH_DAYS = 28;
/** The morning digest tells of the fresh changes on this weekday only (Monday): once a week. */
const DIGEST_WEEKDAY = 1;
/**
 * A change found again a few days off is the same change (it keeps its id). Changes of one
 * number are at least MIN_SEGMENT days apart, so two can never be taken for one.
 */
const SAME_WITHIN_DAYS = 7;
/** A day is "even" (nothing unusual) only when at least this many numbers had a value. */
const EVEN_DAY_NUMBERS = 10;
/** What else changed "around then": within this many days. */
const NEAR_DAYS = 7;
const DAY_MS = 86_400_000;

type Row = typeof linksChangePoints.$inferSelect;

/** The kind of a `links_seen` row of a day with nothing unusual (kept by the job, see markEven). */
export const EVEN_DAY = 'even';

if (SAME_WITHIN_DAYS * 2 >= MIN_SEGMENT) {
  throw new Error('Two changes of one number could be matched as one');
}

/**
 * "What changed": the change points of every number over the last three years (see
 * changePoints), searched by a nightly job and kept; the fresh changes of the main numbers go
 * to the Monday morning digest, so they are told once a week, in the morning, by the AI that
 * names them.
 */
@Injectable()
export class ChangePointsService implements OnModuleInit {
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
      name: 'links.change-points',
      cron: '50 4 * * *',
      handler: async () =>
        forEachUser('links.change-points', await this.users.findAll(), user =>
          this.refresh(user.id),
        ),
    });
    this.digest.register({
      id: 'life.changes',
      module: 'life',
      description:
        'Daily numbers whose level changed lately (Links → What changed): `key` names the ' +
        'number (e.g. activity.phone.night — the phone at night), `since` the first day of ' +
        'the new level, `before` and `after` the typical values (in `unit`). Tell each in ' +
        'a few calm words, without judging ("the phone at night: about 1 h → 2 h since 12 ' +
        'October"), and that Links shows what else changed then.',
      collect: userId => this.digestFacts(userId),
    });
  }

  /** Searches the history again, keeps what it found, and keeps yesterday if it was even. */
  async refresh(userId: string, now = new Date()): Promise<void> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    const today = zonedDateTime(now, timeZone).date;
    // The days that are over: today's level is not known yet.
    const period = {from: shift(today, -HISTORY_DAYS), to: shift(today, -1)};
    const metrics = await this.links.dailyMetrics(userId, period);
    await this.keep(userId, metrics, changePoints(metrics, period));
    await this.markEven(userId, metrics, period.to);
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

  /**
   * Marks something of Links as opened (for the achievements); twice is once. A change is
   * counted only when it is one of the user's own: the achievement is for looking at real ones.
   */
  async seen(userId: string, item: LinksSeen): Promise<void> {
    if (item.kind === 'change') {
      const [own] = await this.db
        .select({id: linksChangePoints.id})
        .from(linksChangePoints)
        .where(
          and(
            eq(linksChangePoints.userId, userId),
            eq(linksChangePoints.id, item.key),
          ),
        );
      if (!own) {
        return;
      }
    }
    await this.db
      .insert(linksSeen)
      .values({userId, kind: item.kind, key: item.key})
      .onConflictDoNothing();
  }

  /** How many things of a kind the user has opened (or how many even days were kept). */
  async seenCount(
    userId: string,
    kind: LinksSeen['kind'] | typeof EVEN_DAY,
  ): Promise<number> {
    const [row] = await this.db
      .select({value: count()})
      .from(linksSeen)
      .where(and(eq(linksSeen.userId, userId), eq(linksSeen.kind, kind)));
    return row?.value ?? 0;
  }

  /**
   * The fresh changes of the main numbers for the morning digest — on Mondays only, so they are
   * told once a week; the digest itself tells a list only when it differs from the last one
   * told. The sections the shared AI must not see stay out.
   */
  async digestFacts(userId: string, now = new Date()): Promise<unknown> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    const today = zonedDateTime(now, timeZone).date;
    if (new Date(`${today}T00:00:00Z`).getUTCDay() !== DIGEST_WEEKDAY) {
      return null;
    }
    const {changes} = await this.list(
      userId,
      await this.connections.hiddenFromShared(userId),
    );
    const fresh = changes
      .filter(
        change => !change.extra && change.day >= shift(today, -FRESH_DAYS),
      )
      .map(({key, unit, day, before, after}) => ({
        key,
        unit,
        since: day,
        before,
        after,
      }));
    return fresh.length ? fresh : null;
  }

  /**
   * Yesterday kept as "an even day" when none of its numbers was unusual (for the achievement;
   * a day of a few numbers says nothing). Here, not in the read of the unusual numbers: a read
   * writes nothing.
   */
  private async markEven(
    userId: string,
    metrics: DailyMetric[],
    day: string,
  ): Promise<void> {
    const known = metrics.filter(metric =>
      seriesOf(metric, [day]).has(day),
    ).length;
    if (
      known >= EVEN_DAY_NUMBERS &&
      !unusualOn(metrics, day, true).numbers.length
    ) {
      await this.db
        .insert(linksSeen)
        .values({userId, kind: EVEN_DAY, key: day})
        .onConflictDoNothing();
    }
  }

  /**
   * Writes what was found: a change found again within a few days of a kept one updates it (its
   * id stays, and so does what was opened of it), a new one is added, one no longer found goes.
   */
  private async keep(
    userId: string,
    metrics: DailyMetric[],
    found: ChangePoint[],
  ): Promise<void> {
    const old = await this.db
      .select()
      .from(linksChangePoints)
      .where(eq(linksChangePoints.userId, userId));
    const byKey = new Map(metrics.map(metric => [metric.key, metric]));
    const left = new Set(old);
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
        await this.db
          .update(linksChangePoints)
          .set(values)
          .where(
            and(
              eq(linksChangePoints.userId, userId),
              eq(linksChangePoints.id, same.id),
            ),
          );
      } else {
        await this.db
          .insert(linksChangePoints)
          .values({userId, ...values})
          .onConflictDoNothing();
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
