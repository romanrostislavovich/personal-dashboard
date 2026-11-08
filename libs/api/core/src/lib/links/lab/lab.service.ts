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
import {experimentResult, makeSchedule} from './lab';
import {labMessages} from './lab.messages';

/** The kinds of `links_seen` rows: a day's morning message and rating question sent. */
const MORNING_SENT = 'labMorning';
const RATING_ASKED = 'labRating';
/** The rating button: `xr:<experiment>:<day>:<1–5>` (within Telegram's 64 bytes). */
const RATING_ACTION = 'xr';

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
        const [id, day, value] = payload.split(':');
        const rating = Number(value);
        try {
          await this.markDay(user.id, id, {day, rating});
        } catch {
          return text.unknown;
        }
        return text.rated(rating);
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
            .where(inArray(linksExperimentVersions.experimentId, ids))
            .orderBy(asc(linksExperimentVersions.version)),
          this.db
            .select()
            .from(linksExperimentDays)
            .where(inArray(linksExperimentDays.experimentId, ids)),
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
  async create(userId: string, input: ExperimentInput): Promise<Experiment> {
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
    return (await this.list(userId)).experiments.find(
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
      .values({userId, experimentId: id, day: input.day, ...values})
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
          eq(linksExperiments.status, 'running'),
        ),
      );
    for (const row of rows) {
      if (row.endOn < local.date) {
        await this.db
          .update(linksExperiments)
          .set({status: 'done', updatedAt: new Date()})
          .where(eq(linksExperiments.id, row.id));
        await this.notifications.send(userId, {
          title: text.doneTitle,
          body: text.doneBody(row.hypothesis),
          source: 'life',
          link: '/life/lab',
        });
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
    // The days that are over (today's number is not done yet), each with its value and mark.
    const days = row.schedule
      .filter(one => one.day < today)
      .map(one => {
        const mark = marks.find(day => day.day === one.day);
        return {
          day: one.day,
          condition: one.condition,
          value:
            row.metricKind === 'rating'
              ? (mark?.rating ?? null)
              : (values?.get(one.day) ?? null),
          kept: mark?.kept ?? null,
        };
      });
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
      })),
      days,
      today:
        row.status === 'running'
          ? (row.schedule.find(one => one.day === today)?.condition ?? null)
          : null,
      result: experimentResult(days),
    };
  }

  private async keepVersion(row: Row): Promise<void> {
    await this.db.insert(linksExperimentVersions).values({
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

  /** The users with a running experiment: the job looks at no one else. */
  private async runningUsers(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({userId: linksExperiments.userId})
      .from(linksExperiments)
      .where(eq(linksExperiments.status, 'running'));
    return rows.map(row => row.userId);
  }

  private async todayOf(userId: string, now: Date): Promise<LocalDate> {
    return zonedDateTime(
      now,
      this.users.timeZoneOf(await this.users.findById(userId)),
    ).date;
  }
}
