import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  DailyMetric,
  DEFAULT_FORECAST_TARGETS,
  ForecastCandidate,
  ForecastMade,
  LinksForecast,
  LinksForecasts,
  LocalDate,
  MAX_FORECAST_TARGETS,
  PastForecast,
  zonedDateTime,
} from '@pd/contracts';
import {and, eq, gte} from 'drizzle-orm';
import {AiConnectionsService} from '../ai/ai-connections.service';
import {MorningDigestService} from '../ai/morning-digest.service';
import {DB, Database} from '../database/database.module';
import {forEachUser} from '../scheduler/for-each-user';
import {SchedulerService} from '../scheduler/scheduler.service';
import {UsersService} from '../users/users.service';
import {seriesOf, shift, SURROUNDINGS} from './daily-series';
import {BEDTIME_TARGET, bedtimeMetric, forecast, MIN_DAYS} from './forecast';
import {LinksService} from './links.service';
import {linksForecasts, linksSettings} from './links.schema';

/** The model learns from the last two years. */
const HISTORY_DAYS = 730;
/** The morning's forecast of the day is made from this hour on: yesterday is over by then. */
const MORNING_HOUR = 5;
/** After this hour the morning's forecast of the day is not made any more: the day is on. */
const MORNING_UNTIL_HOUR = 12;
/**
 * The evening's of the next day: made from this hour on by the job (the evening summary makes
 * it earlier when it is sent earlier), and shown on the page from EVENING_SHOWN_HOUR.
 */
const EVENING_HOUR = 21;
const EVENING_SHOWN_HOUR = 18;
/** The kept forecasts shown, for how close they came. */
const PAST_DAYS = 28;

type Row = typeof linksForecasts.$inferSelect;

/**
 * Forecasts of the numbers (Links v2): the default targets and the user's chosen main numbers,
 * each by a model of the user's own days (see forecast.ts). An hourly job keeps the morning's
 * forecast of the day and the evening's of the next, so later they can be compared with what
 * the day was; the trusted ones go to the morning digest and the evening summary.
 */
@Injectable()
export class ForecastsService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly users: UsersService,
    private readonly scheduler: SchedulerService,
    private readonly digest: MorningDigestService,
    private readonly connections: AiConnectionsService,
  ) {}

  onModuleInit(): void {
    // Hourly, in each user's own time: the morning and the evening come at different hours
    // around the world, and a run missed while the server was off is made up an hour later.
    this.scheduler.register({
      name: 'links.forecasts',
      cron: '7 * * * *',
      handler: async () =>
        forEachUser('links.forecasts', await this.users.findAll(), user =>
          this.keepDue(user.id),
        ),
    });
    this.digest.register({
      id: 'life.forecasts',
      module: 'life',
      description:
        "Today's forecasts of the user's own numbers (Links → Forecasts), each by a model of " +
        'their own days that beat the plain guess: `key` names the number (links.bedtime — ' +
        'the bedtime, hours of the evening, over 24 after midnight; activity.index.deepWork — ' +
        'hours of deep work; tasks.done — tasks done; diary.mood — the mood 1–5), `value` the ' +
        'forecast in `unit`, `miss` its usual miss, `drivers` what pushed it (`effect` in the ' +
        'same unit). Tell them in a few calm words as a guess, not a plan ("today\'s deep ' +
        'work: about 2 h — a short night pulls it down").',
      collect: userId => this.digestFacts(userId),
    });
  }

  /** The default targets, then the chosen ones. */
  async targets(userId: string): Promise<string[]> {
    const [row] = await this.db
      .select({targets: linksSettings.forecastTargets})
      .from(linksSettings)
      .where(eq(linksSettings.userId, userId));
    return [
      ...DEFAULT_FORECAST_TARGETS,
      ...(row?.targets ?? []).filter(
        key => !(DEFAULT_FORECAST_TARGETS as readonly string[]).includes(key),
      ),
    ];
  }

  /** How many targets the user chose beyond the default ones (for the achievement). */
  async chosenCount(userId: string): Promise<number> {
    return (
      (await this.targets(userId)).length - DEFAULT_FORECAST_TARGETS.length
    );
  }

  /** Keeps the chosen targets: only main numbers the user has, the default ones not again. */
  async setTargets(userId: string, targets: string[]): Promise<void> {
    const {metrics} = await this.metricsOf(
      userId,
      zonedDateTime(new Date(), await this.timeZone(userId)).date,
    );
    const known = new Set(candidatesOf(metrics).map(one => one.key));
    const chosen = [...new Set(targets)]
      .filter(key => known.has(key))
      .slice(0, MAX_FORECAST_TARGETS);
    await this.db
      .insert(linksSettings)
      .values({userId, forecastTargets: chosen})
      .onConflictDoUpdate({
        target: linksSettings.userId,
        set: {forecastTargets: chosen},
      });
  }

  /**
   * The page: today's forecasts (the kept morning ones, else made now), in the evening the next
   * day's too, the kept ones of the last weeks with what the days were, and the numbers that may
   * be chosen. A read writes nothing: what is made here is not kept. The `hidden` sections are
   * left out (for the assistant: those its AI must not see).
   */
  async list(
    userId: string,
    hidden: string[] = [],
    now = new Date(),
  ): Promise<LinksForecasts> {
    const local = zonedDateTime(now, await this.timeZone(userId));
    const today = local.date;
    const targets = await this.targets(userId);
    const {all, metrics} = await this.metricsOf(userId, today);
    const shown = (list: DailyMetric[]) =>
      list.filter(metric => !hidden.includes(metric.module));
    const visible = shown(metrics);
    const targetMetrics = targetsOf(all, visible, targets);
    const kept = await this.kept(userId, shift(today, -PAST_DAYS));

    const made: LinksForecast[] = [];
    const make = (day: LocalDate, when: ForecastMade) => {
      for (const target of targetMetrics) {
        const row = kept.find(
          one => one.key === target.key && one.day === day && one.made === when,
        );
        made.push(row ? fromRow(row) : forecast(visible, target, day, when));
      }
    };
    make(today, 'morning');
    if (Number(local.time.slice(0, 2)) >= EVENING_SHOWN_HOUR) {
      make(shift(today, 1), 'evening');
    }

    const actualOf = new Map(
      targetMetrics.map(target => [
        target.key,
        seriesOf(
          target,
          kept.map(row => row.day),
        ),
      ]),
    );
    const past: PastForecast[] = kept
      .filter(row => actualOf.has(row.key))
      .map(row => ({
        key: row.key,
        day: row.day,
        made: row.made as ForecastMade,
        value: row.value,
        trusted: row.trusted,
        actual:
          row.day < today
            ? (actualOf.get(row.key)?.get(row.day) ?? null)
            : null,
      }))
      .sort((a, b) => b.day.localeCompare(a.day));

    return {
      today,
      targets: targetMetrics.map(target => target.key),
      forecasts: made,
      past,
      candidates: candidatesOf(shown(all)).filter(
        one => !targets.includes(one.key),
      ),
    };
  }

  /**
   * The next day's trusted forecasts of the default targets, made now if they were not, for the
   * evening summary (it names only these: the server has no translations of the others).
   */
  async tomorrow(userId: string, now = new Date()): Promise<LinksForecast[]> {
    const forecasts = await this.keep(userId, 'evening', now);
    return forecasts.filter(
      one =>
        one.trusted &&
        (DEFAULT_FORECAST_TARGETS as readonly string[]).includes(one.key),
    );
  }

  /**
   * Keeps the morning's forecasts in the morning and the evening's late in the evening: those
   * not kept yet. Only then: a target that cannot be made (too few days) is tried again a few
   * times, not every hour of the day, as each try reads two years of every number.
   */
  async keepDue(userId: string, now = new Date()): Promise<void> {
    const hour = Number(
      zonedDateTime(now, await this.timeZone(userId)).time.slice(0, 2),
    );
    if (hour >= MORNING_HOUR && hour < MORNING_UNTIL_HOUR) {
      await this.keep(userId, 'morning', now);
    }
    if (hour >= EVENING_HOUR) {
      await this.keep(userId, 'evening', now);
    }
  }

  /**
   * The forecasts of the morning (of today) or of the evening (of tomorrow): those kept, and the
   * missing ones made and kept. The sections the user hid are left out.
   */
  async keep(
    userId: string,
    made: ForecastMade,
    now = new Date(),
  ): Promise<LinksForecast[]> {
    const user = await this.users.findById(userId);
    const today = zonedDateTime(now, this.users.timeZoneOf(user)).date;
    const day = made === 'morning' ? today : shift(today, 1);
    const hidden = this.users.hiddenSections(user);
    const targets = await this.targets(userId);
    const kept = (await this.kept(userId, day)).filter(
      row => row.day === day && row.made === made,
    );
    const missing = targets.filter(key => !kept.some(row => row.key === key));
    if (!missing.length) {
      return kept.map(fromRow);
    }
    const {all, metrics} = await this.metricsOf(userId, today);
    const visible = metrics.filter(metric => !hidden.includes(metric.module));
    const targetMetrics = targetsOf(
      all.filter(metric => !hidden.includes(metric.module)),
      visible,
      targets,
    );
    const result: LinksForecast[] = [];
    for (const target of targetMetrics) {
      const row = kept.find(one => one.key === target.key);
      if (row) {
        result.push(fromRow(row));
        continue;
      }
      const found = forecast(visible, target, day, made);
      result.push(found);
      if (found.value === null) {
        continue;
      }
      await this.db
        .insert(linksForecasts)
        .values({
          userId,
          key: found.key,
          module: found.module,
          labelKey: found.labelKey,
          label: found.label ?? null,
          unit: found.unit,
          currency: found.currency ?? null,
          day,
          made,
          value: found.value,
          error: found.error ?? 0,
          baselineError: found.baselineError ?? 0,
          baseline: found.baseline ?? 'yesterday',
          days: found.days,
          trusted: found.trusted,
          drivers: found.drivers,
        })
        .onConflictDoNothing();
    }
    return result;
  }

  /** Today's trusted forecasts for the morning digest; the sections hidden from the AI stay out. */
  async digestFacts(userId: string, now = new Date()): Promise<unknown> {
    const hidden = await this.connections.hiddenFromShared(userId);
    const forecasts = (await this.keep(userId, 'morning', now)).filter(
      one => one.trusted && one.value !== null && !hidden.includes(one.module),
    );
    return forecasts.length
      ? forecasts.map(one => ({
          key: one.key,
          unit: one.unit,
          value: one.value,
          miss: one.error,
          drivers: one.drivers
            .filter(driver => !hidden.includes(driver.key.split('.')[0]))
            .map(({key, effect}) => ({key, effect})),
        }))
      : null;
  }

  /** The kept forecasts of the days from `from` on. */
  private kept(userId: string, from: LocalDate): Promise<Row[]> {
    return this.db
      .select()
      .from(linksForecasts)
      .where(
        and(eq(linksForecasts.userId, userId), gte(linksForecasts.day, from)),
      );
  }

  /** Every number of the last two years up to `today`: all of them, and the main ones. */
  private async metricsOf(
    userId: string,
    today: LocalDate,
  ): Promise<{all: DailyMetric[]; metrics: DailyMetric[]}> {
    const all = await this.links.dailyMetrics(userId, {
      from: shift(today, -HISTORY_DAYS),
      to: today,
    });
    return {all, metrics: all.filter(metric => !metric.extra)};
  }

  private async timeZone(userId: string): Promise<string> {
    return this.users.timeZoneOf(await this.users.findById(userId));
  }
}

/**
 * The targets as numbers: the bedtime made of the band and the phone (`all`: the phone's last
 * use is an extra number), the others the main numbers of that key.
 */
function targetsOf(
  all: DailyMetric[],
  metrics: DailyMetric[],
  keys: string[],
): DailyMetric[] {
  return keys.flatMap(key => {
    const metric =
      key === BEDTIME_TARGET
        ? bedtimeMetric(all)
        : metrics.find(one => one.key === key);
    return metric ? [metric] : [];
  });
}

/** The main numbers worth a forecast: the person's own (not the weather), seen long enough. */
function candidatesOf(metrics: DailyMetric[]): ForecastCandidate[] {
  return metrics
    .filter(
      metric =>
        !metric.extra &&
        !SURROUNDINGS.has(metric.module) &&
        metric.days.length >= MIN_DAYS,
    )
    .map(metric => ({
      key: metric.key,
      module: metric.module,
      labelKey: metric.labelKey,
      ...(metric.label ? {label: metric.label} : {}),
      unit: metric.unit,
    }));
}

function fromRow(row: Row): LinksForecast {
  return {
    key: row.key,
    module: row.module,
    labelKey: row.labelKey,
    ...(row.label ? {label: row.label} : {}),
    unit: row.unit as LinksForecast['unit'],
    ...(row.currency ? {currency: row.currency} : {}),
    day: row.day,
    made: row.made as ForecastMade,
    value: row.value,
    days: row.days,
    error: row.error,
    baselineError: row.baselineError,
    baseline: row.baseline as LinksForecast['baseline'],
    trusted: row.trusted,
    drivers: row.drivers,
  };
}
