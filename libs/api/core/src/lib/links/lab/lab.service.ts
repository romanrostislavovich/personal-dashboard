import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  Experiment,
  ExperimentDayInput,
  experimentDaySchema,
  ExperimentInput,
  ExperimentUpdate,
  LinksLab,
  LocalDate,
  zonedDateTime,
} from '@pd/contracts';
import {and, asc, desc, eq, inArray} from 'drizzle-orm';
import {DB, Database} from '../../database/database.module';
import {TelegramBotService} from '../../notifications/telegram/telegram-bot.service';
import {NotificationsService} from '../../notifications/notifications.service';
import {forEachUser} from '../../scheduler/for-each-user';
import {SchedulerService} from '../../scheduler/scheduler.service';
import {UsersService} from '../../users/users.service';
import {seriesOf, shift} from '../daily-series';
import {LinksService} from '../links.service';
import {
  linksExperimentDays,
  linksExperiments,
  linksExperimentVersions,
  linksSeen,
} from '../links.schema';
import {experimentResult, makeSchedule, stableId} from './lab';
import {labMessages} from './lab.messages';

/** The kinds of `links_seen` rows: a day's morning message and rating question sent. */
const MORNING_SENT = 'labMorning';
const RATING_ASKED = 'labRating';
/** The rating button: `xr:<experiment>:<day>:<1–5>` (within Telegram's 64 bytes). */
const RATING_ACTION = 'xr';

/** The kinds the job looks at: a paused one is still done past its end, but told nothing. */
const LIVE = ['running', 'paused'] as const;

type Row = typeof linksExperiments.$inferSelect;

/**
 * The personal lab (Links v2): experiments with random ordinary and changed days chosen before
 * the start; a morning message tells the day's kind, a rating one asks 1–5 with buttons at its
 * hour; pause, stop and a change of the rules (a new version, the old ones kept); and a calm
 * description of what came of it. Made and sent by the server; a sync client reads them.
 */
@Injectable()
export class LabService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly users: UsersService,
    private readonly scheduler: SchedulerService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramBotService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'links.lab',
      cron: '*/10 * * * *',
      handler: async () =>
        forEachUser('links.lab', await this.runningUsers(), userId =>
          this.tell(userId),
        ),
    });
    this.telegram.registerAction({
      name: RATING_ACTION,
      handler: async (user, payload) => {
        const text = labMessages(user.locale);
        const press = this.pressOf(payload);
        if (!press) {
          return text.unknown;
        }
        try {
          await this.markDay(user.id, press.id, {
            day: press.day,
            rating: press.rating,
          });
        } catch (error) {
          // Gone or over: told so; anything else (the database) is a real failure.
          if (
            error instanceof NotFoundException ||
            error instanceof BadRequestException
          ) {
            return text.unknown;
          }
          throw error;
        }
        return text.rated(press.rating);
      },
      // Rated on the page already: a question held for the quiet hours is not sent.
      settled: async (user, payload) => {
        const press = this.pressOf(payload);
        if (!press) {
          return true;
        }
        const [mark] = await this.db
          .select({rating: linksExperimentDays.rating})
          .from(linksExperimentDays)
          .where(
            and(
              eq(linksExperimentDays.userId, user.id),
              eq(linksExperimentDays.experimentId, press.id),
              eq(linksExperimentDays.day, press.day),
            ),
          );
        return typeof mark?.rating === 'number';
      },
    });
  }

  /** Every experiment of the user with its days and what came of it, the newest first. */
  async list(userId: string, now = new Date()): Promise<LinksLab> {
    const today = await this.todayOf(userId, now);
    const rows = await this.db
      .select()
      .from(linksExperiments)
      .where(eq(linksExperiments.userId, userId))
      .orderBy(desc(linksExperiments.createdAt));
    const ids = rows.map(row => row.id);
    const [versions, marks] = ids.length
      ? await Promise.all([
          this.db
            .select()
            .from(linksExperimentVersions)
            .where(
              and(
                eq(linksExperimentVersions.userId, userId),
                inArray(linksExperimentVersions.experimentId, ids),
              ),
            )
            .orderBy(asc(linksExperimentVersions.version)),
          this.db
            .select()
            .from(linksExperimentDays)
            .where(
              and(
                eq(linksExperimentDays.userId, userId),
                inArray(linksExperimentDays.experimentId, ids),
              ),
            ),
        ])
      : [[], []];
    const experiments: Experiment[] = [];
    for (const row of rows) {
      experiments.push(
        await this.toExperiment(
          userId,
          row,
          versions.filter(one => one.experimentId === row.id),
          marks.filter(one => one.experimentId === row.id),
          today,
        ),
      );
    }
    return {today, experiments};
  }

  /** Starts one: the random days made now, before the start, and the rules' first version. */
  async create(
    userId: string,
    input: ExperimentInput,
    now = new Date(),
  ): Promise<Experiment> {
    // Drawn before the days come: a start in the past would let them be chosen knowing them.
    if (input.startOn < (await this.todayOf(userId, now))) {
      throw new BadRequestException('An experiment starts today or later');
    }
    const metric =
      input.metric.kind === 'number'
        ? await this.links.dailyMetric(userId, input.metric.key, {
            from: shift(input.startOn, -60),
            to: input.startOn,
          })
        : null;
    if (input.metric.kind === 'number' && !metric) {
      throw new BadRequestException('Unknown number for an experiment');
    }
    const schedule = makeSchedule(input.startOn, input.days);
    const [row] = await this.db
      .insert(linksExperiments)
      .values({
        userId,
        hypothesis: input.hypothesis,
        change: input.change,
        metricKind: input.metric.kind,
        metricKey: input.metric.kind === 'number' ? input.metric.key : null,
        question: input.metric.kind === 'rating' ? input.metric.question : null,
        askAt: input.metric.kind === 'rating' ? input.metric.askAt : null,
        morningAt: input.morningAt,
        startOn: input.startOn,
        endOn: schedule[schedule.length - 1].day,
        schedule,
        status: 'running',
      })
      .returning();
    await this.keepVersion(row);
    return (await this.list(userId, now)).experiments.find(
      one => one.id === row.id,
    ) as Experiment;
  }

  /** Pause, go on or stop; a change of the words or the hours is a new version of the rules. */
  async update(
    userId: string,
    id: string,
    input: ExperimentUpdate,
  ): Promise<void> {
    const row = await this.own(userId, id);
    if (row.status === 'stopped' || row.status === 'done') {
      throw new BadRequestException('The experiment is over');
    }
    const rules = {
      hypothesis: input.hypothesis ?? row.hypothesis,
      change: input.change ?? row.change,
      morningAt: input.morningAt ?? row.morningAt,
      askAt: row.metricKind === 'rating' ? (input.askAt ?? row.askAt) : null,
    };
    const changed =
      rules.hypothesis !== row.hypothesis ||
      rules.change !== row.change ||
      rules.morningAt !== row.morningAt ||
      rules.askAt !== row.askAt;
    const [updated] = await this.db
      .update(linksExperiments)
      .set({
        ...rules,
        status: input.status ?? row.status,
        version: changed ? row.version + 1 : row.version,
        updatedAt: new Date(),
      })
      .where(
        and(eq(linksExperiments.userId, userId), eq(linksExperiments.id, id)),
      )
      .returning();
    if (changed) {
      await this.keepVersion(updated);
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.own(userId, id);
    await this.db
      .delete(linksExperiments)
      .where(
        and(eq(linksExperiments.userId, userId), eq(linksExperiments.id, id)),
      );
  }

  /** A day of it marked: the rating, whether the plan was kept — a day of it, not to come. */
  async markDay(
    userId: string,
    id: string,
    input: ExperimentDayInput,
    now = new Date(),
  ): Promise<void> {
    const row = await this.own(userId, id);
    // A stopped one is over by the user's word; a done one may still get its last days filled.
    if (row.status === 'stopped') {
      throw new BadRequestException('The experiment is over');
    }
    const today = await this.todayOf(userId, now);
    if (!row.schedule.some(one => one.day === input.day) || input.day > today) {
      throw new BadRequestException('Not a day of the experiment');
    }
    const values = {
      ...(input.rating !== undefined && row.metricKind === 'rating'
        ? {rating: input.rating}
        : {}),
      ...(input.kept !== undefined ? {kept: input.kept} : {}),
    };
    await this.db
      .insert(linksExperimentDays)
      .values({
        id: stableId(`${id}|${input.day}`),
        userId,
        experimentId: id,
        day: input.day,
        ...values,
      })
      .onConflictDoUpdate({
        target: [linksExperimentDays.experimentId, linksExperimentDays.day],
        set: {...values, updatedAt: new Date()},
      });
  }

  /** How many experiments the user saw to the end, and the days they kept the plan. */
  async counts(userId: string): Promise<{done: number; kept: number}> {
    const [done, kept] = await Promise.all([
      this.db.$count(
        linksExperiments,
        and(
          eq(linksExperiments.userId, userId),
          eq(linksExperiments.status, 'done'),
        ),
      ),
      this.db.$count(
        linksExperimentDays,
        and(
          eq(linksExperimentDays.userId, userId),
          eq(linksExperimentDays.kept, true),
        ),
      ),
    ]);
    return {done, kept};
  }

  /**
   * The job's, every ten minutes in the user's own time: an experiment past its end is done
   * (and told so); the morning message once its hour has come, the rating question at its own —
   * each once a day.
   */
  async tell(userId: string, now = new Date()): Promise<void> {
    const user = await this.users.findById(userId);
    const local = zonedDateTime(now, this.users.timeZoneOf(user));
    const text = labMessages(user?.locale);
    const rows = await this.db
      .select()
      .from(linksExperiments)
      .where(
        and(
          eq(linksExperiments.userId, userId),
          inArray(linksExperiments.status, LIVE),
        ),
      );
    for (const row of rows) {
      if (row.endOn < local.date) {
        // Told once: by the run that turned it done (not again after a sync brought it back).
        const done = await this.db
          .update(linksExperiments)
          .set({status: 'done', updatedAt: new Date()})
          .where(
            and(
              eq(linksExperiments.userId, userId),
              eq(linksExperiments.id, row.id),
              inArray(linksExperiments.status, LIVE),
            ),
          )
          .returning({id: linksExperiments.id});
        if (done.length) {
          await this.notifications.send(userId, {
            title: text.doneTitle,
            body: text.doneBody(row.hypothesis),
            source: 'life',
            link: '/life/lab',
          });
        }
        continue;
      }
      if (row.status !== 'running') {
        continue;
      }
      const today = row.schedule.find(one => one.day === local.date);
      if (!today) {
        continue;
      }
      if (
        local.time >= row.morningAt &&
        (await this.once(userId, MORNING_SENT, row.id, local.date))
      ) {
        await this.notifications.send(userId, {
          title:
            today.condition === 'changed'
              ? text.changedTitle
              : text.ordinaryTitle,
          body:
            today.condition === 'changed'
              ? text.changedBody(row.change, row.hypothesis)
              : text.ordinaryBody(row.hypothesis),
          source: 'life',
          link: '/life/lab',
        });
      }
      if (
        row.metricKind === 'rating' &&
        row.askAt &&
        local.time >= row.askAt &&
        (await this.once(userId, RATING_ASKED, row.id, local.date))
      ) {
        await this.notifications.send(userId, {
          title: text.ratingTitle,
          body: row.question ?? row.hypothesis,
          source: 'life',
          link: '/life/lab',
          actions: [1, 2, 3, 4, 5].map(value => ({
            label: String(value),
            action: `${RATING_ACTION}:${row.id}:${local.date}:${value}`,
          })),
        });
      }
    }
  }

  /** Marks a message of a day as sent; `false` — it was already (once a day, restarts too). */
  private async once(
    userId: string,
    kind: string,
    id: string,
    day: LocalDate,
  ): Promise<boolean> {
    const inserted = await this.db
      .insert(linksSeen)
      .values({userId, kind, key: `${id}|${day}`})
      .onConflictDoNothing()
      .returning({key: linksSeen.key});
    return inserted.length > 0;
  }

  private async toExperiment(
    userId: string,
    row: Row,
    versions: (typeof linksExperimentVersions.$inferSelect)[],
    marks: (typeof linksExperimentDays.$inferSelect)[],
    today: LocalDate,
  ): Promise<Experiment> {
    const metric =
      row.metricKind === 'number' && row.metricKey
        ? await this.links.dailyMetric(userId, row.metricKey, {
            from: row.startOn,
            to: row.endOn < today ? row.endOn : today,
          })
        : null;
    const values =
      metric && row.metricKey
        ? seriesOf(
            metric,
            row.schedule.map(one => one.day),
          )
        : null;
    // Every day of the plan: a number of Links once the day is over, a rating once given.
    const days = row.schedule.map(one => {
      const mark = marks.find(day => day.day === one.day);
      const value =
        row.metricKind === 'rating'
          ? one.day <= today
            ? (mark?.rating ?? null)
            : null
          : one.day < today
            ? (values?.get(one.day) ?? null)
            : null;
      return {
        day: one.day,
        condition: one.condition,
        value,
        kept: mark?.kept ?? null,
      };
    });
    // What came of it counts the days begun: the past ones, and today once it has its value.
    const begun = days.filter(
      one => one.day < today || (one.day === today && one.value !== null),
    );
    return {
      id: row.id,
      hypothesis: row.hypothesis,
      change: row.change,
      metric:
        row.metricKind === 'rating'
          ? {
              kind: 'rating',
              question: row.question ?? '',
              askAt: row.askAt ?? '',
            }
          : {
              kind: 'number',
              key: row.metricKey ?? '',
              labelKey: metric?.labelKey ?? row.metricKey ?? '',
              ...(metric?.label ? {label: metric.label} : {}),
              unit: metric?.unit ?? 'count',
            },
      startOn: row.startOn,
      endOn: row.endOn,
      morningAt: row.morningAt,
      status: row.status,
      version: row.version,
      versions: versions.map(one => ({
        version: one.version,
        at: one.at.toISOString(),
        hypothesis: one.hypothesis,
        change: one.change,
        morningAt: one.morningAt,
        askAt: one.askAt,
      })),
      days,
      today:
        row.status === 'running'
          ? (row.schedule.find(one => one.day === today)?.condition ?? null)
          : null,
      result: experimentResult(begun),
    };
  }

  private async keepVersion(row: Row): Promise<void> {
    await this.db.insert(linksExperimentVersions).values({
      id: stableId(`${row.id}|v${row.version}`),
      userId: row.userId,
      experimentId: row.id,
      version: row.version,
      hypothesis: row.hypothesis,
      change: row.change,
      morningAt: row.morningAt,
      askAt: row.askAt,
    });
  }

  private async own(userId: string, id: string): Promise<Row> {
    const [row] = await this.db
      .select()
      .from(linksExperiments)
      .where(
        and(eq(linksExperiments.userId, userId), eq(linksExperiments.id, id)),
      );
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  /** The users with a running or paused experiment: the job looks at no one else. */
  private async runningUsers(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({userId: linksExperiments.userId})
      .from(linksExperiments)
      .where(inArray(linksExperiments.status, LIVE));
    return rows.map(row => row.userId);
  }

  /** A rating button's payload `<experiment>:<day>:<1–5>`, checked; `null` — not one. */
  private pressOf(
    payload: string,
  ): {id: string; day: LocalDate; rating: number} | null {
    const [id, day, value] = payload.split(':');
    const parsed = experimentDaySchema.safeParse({day, rating: Number(value)});
    if (
      !/^[0-9a-f-]{36}$/i.test(id ?? '') ||
      !parsed.success ||
      typeof parsed.data.rating !== 'number'
    ) {
      return null;
    }
    return {id, day: parsed.data.day, rating: parsed.data.rating};
  }

  private async todayOf(userId: string, now: Date): Promise<LocalDate> {
    return zonedDateTime(
      now,
      this.users.timeZoneOf(await this.users.findById(userId)),
    ).date;
  }
}
