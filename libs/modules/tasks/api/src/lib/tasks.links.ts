import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {DB, Database, daysOf, LinksService, UsersService} from '@pd/api-core';
import {
  addDays,
  DailyMetric,
  LocalDate,
  parseLocalDate,
  toLocalDate,
  zonedDateTime,
  zonedToUtc,
} from '@pd/contracts';
import {and, eq, gte, isNotNull, isNull, lt, or, sql} from 'drizzle-orm';
import {TaskDayNumbers, taskDayNumbers} from './tasks-metrics';
import {tasks} from './tasks.schema';

/**
 * What tasks tell the other sections (see LinksService): the tasks of a project for its
 * overview, and the tasks done and the tasks that came up on every day, and the open loops.
 */
@Injectable()
export class TasksLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.links.registerProject({
      module: 'tasks',
      facts: async (userId, project, period) => {
        const ofProject = and(
          eq(tasks.userId, userId),
          eq(tasks.projectId, project.id),
        );
        const open = await this.db.$count(
          tasks,
          and(ofProject, isNull(tasks.completedAt)),
        );
        const done = await this.db.$count(
          tasks,
          and(ofProject, await this.doneWithin(userId, period)),
        );
        return open || done
          ? [
              {
                module: 'tasks',
                labelKey: 'tasks.links.open',
                value: open,
                unit: 'count',
                link: '/tasks/todo',
              },
              {
                module: 'tasks',
                labelKey: 'tasks.links.done',
                value: done,
                unit: 'count',
                link: '/tasks/todo',
              },
            ]
          : [];
      },
    });

    // Hour by hour: the tasks done in each hour (a productive number of the window).
    this.links.registerHourly({
      module: 'tasks',
      hours: async (userId, period, timeZone) => {
        const hour = sql<string>`to_char(${tasks.completedAt} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD"T"HH24')`;
        const rows = await this.db
          .select({hour, done: sql<number>`count(*)::int`})
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, userId),
              await this.doneWithin(userId, period),
            ),
          )
          .groupBy(sql`1`);
        const [first] = await this.db
          .select({
            day: sql<LocalDate | null>`to_char(min(${tasks.createdAt}) AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`,
          })
          .from(tasks)
          .where(eq(tasks.userId, userId));
        // Every day since the first task is a day of the list: an hour of nothing done is a zero.
        const days = first?.day
          ? daysOf(period).filter(day => day >= (first.day as LocalDate))
          : [];
        // No task ever: no number at all, not one of empty days.
        if (!days.length) {
          return {metrics: [], events: []};
        }
        return {
          metrics: [
            {
              key: 'tasks.hour.done',
              module: 'tasks',
              labelKey: 'tasks.links.done',
              unit: 'count',
              productive: true,
              days,
              hours: rows.map(row => ({hour: row.hour, value: row.done})),
            },
          ],
          events: [],
        };
      },
    });

    this.links.registerDailyMetrics({
      module: 'tasks',
      metrics: async (userId, period) => {
        const timeZone = await this.timeZone(userId);
        const day = sql<LocalDate>`to_char(${tasks.completedAt} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`;
        const days = await this.db
          .select({day, done: sql<number>`count(*)::int`})
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, userId),
              await this.doneWithin(userId, period),
            ),
          )
          // By position: the time zone is a parameter (see ActivityService.stats).
          .groupBy(sql`1`);
        // The tasks that came up: what landed on the day, done or not.
        const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
        const created = await this.db
          .select({
            day: sql<LocalDate>`to_char(${tasks.createdAt} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`,
          })
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, userId),
              gte(
                tasks.createdAt,
                zonedToUtc({date: period.from, time: '00:00'}, timeZone),
              ),
              lt(
                tasks.createdAt,
                zonedToUtc({date: after, time: '00:00'}, timeZone),
              ),
            ),
          )
          .groupBy(sql`1`);
        const metrics: DailyMetric[] = [
          {
            key: 'tasks.done',
            module: 'tasks',
            labelKey: 'tasks.links.done',
            unit: 'count',
            outcome: true,
            days: days.map(({day: date, done}) => ({day: date, value: done})),
          },
          {
            key: 'tasks.created',
            module: 'tasks',
            labelKey: 'tasks.links.created',
            unit: 'count',
            days: created.map(({day: date, count}) => ({
              day: date,
              value: count,
            })),
          },
          ...(await this.openLoops(userId, period, timeZone)),
        ];
        return metrics.filter(metric => metric.days.length);
      },
    });

    this.links.registerPages([
      {module: 'tasks', path: '/tasks/todo', description: 'the TODO list'},
      {module: 'tasks', path: '/tasks/reminders', description: 'reminders'},
    ]);
  }

  /**
   * The open loops (undated or overdue), the share of what was due that got done, the important
   * ones done — counted back from the tasks of the period (see taskDayNumbers).
   */
  private async openLoops(
    userId: string,
    period: {from: LocalDate; to: LocalDate},
    timeZone: string,
  ): Promise<DailyMetric[]> {
    const numbers = await this.dayNumbers(userId, period, timeZone);
    const metric = (
      key: keyof typeof numbers,
      unit: DailyMetric['unit'],
      more: Partial<DailyMetric> = {},
    ): DailyMetric => ({
      key: `tasks.${key}`,
      module: 'tasks',
      labelKey: `tasks.links.${key}`,
      unit,
      days: numbers[key],
      ...more,
    });
    return [
      metric('openLoops', 'count'),
      metric('overdue', 'count', {partOf: 'tasks.openLoops'}),
      metric('dueDone', 'percent', {outcome: true}),
      metric('importantDone', 'count', {partOf: 'tasks.done'}),
    ];
  }

  /** The tasks' numbers of every day from the first task to today: for the achievements. */
  async allDays(userId: string): Promise<TaskDayNumbers> {
    const timeZone = await this.timeZone(userId);
    const today = zonedDateTime(new Date(), timeZone).date;
    return this.dayNumbers(userId, {from: '2000-01-01', to: today}, timeZone);
  }

  /** The numbers counted back from the tasks of the period (see taskDayNumbers). */
  async dayNumbers(
    userId: string,
    period: {from: LocalDate; to: LocalDate},
    timeZone: string,
  ): Promise<TaskDayNumbers> {
    const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
    const localDay = (
      column: typeof tasks.createdAt | typeof tasks.completedAt,
    ) =>
      sql<LocalDate>`to_char(${column} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({
        created: localDay(tasks.createdAt),
        done: sql<LocalDate | null>`case when ${tasks.completedAt} is null then null else ${localDay(tasks.completedAt)} end`,
        due: tasks.dueDate,
        priority: tasks.priority,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          lt(
            tasks.createdAt,
            zonedToUtc({date: after, time: '00:00'}, timeZone),
          ),
          or(
            isNull(tasks.completedAt),
            gte(
              tasks.completedAt,
              zonedToUtc({date: period.from, time: '00:00'}, timeZone),
            ),
          ),
        ),
      );
    return taskDayNumbers(rows, period);
  }

  /** Done on the user's own days of a period. */
  private async doneWithin(
    userId: string,
    period: {from: LocalDate; to: LocalDate},
  ) {
    const timeZone = await this.timeZone(userId);
    const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
    return and(
      isNotNull(tasks.completedAt),
      gte(
        tasks.completedAt,
        zonedToUtc({date: period.from, time: '00:00'}, timeZone),
      ),
      lt(tasks.completedAt, zonedToUtc({date: after, time: '00:00'}, timeZone)),
    );
  }

  private async timeZone(userId: string): Promise<string> {
    return this.users.timeZoneOf(await this.users.findById(userId));
  }
}
