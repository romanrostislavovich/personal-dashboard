import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LinksService, UsersService } from '@pd/api-core';
import { addDays, LocalDate, parseLocalDate, toLocalDate, zonedToUtc } from '@pd/contracts';
import { and, eq, gte, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { tasks } from './tasks.schema';

/**
 * What tasks tell the other sections (see LinksService): the tasks of a project for its
 * overview, and the tasks done on every day.
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
        const ofProject = and(eq(tasks.userId, userId), eq(tasks.projectId, project.id));
        const open = await this.db.$count(tasks, and(ofProject, isNull(tasks.completedAt)));
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

    this.links.registerDailyMetrics({
      module: 'tasks',
      metrics: async (userId, period) => {
        const timeZone = await this.timeZone(userId);
        const day = sql<LocalDate>`to_char(${tasks.completedAt} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`;
        const days = await this.db
          .select({ day, done: sql<number>`count(*)::int` })
          .from(tasks)
          .where(and(eq(tasks.userId, userId), await this.doneWithin(userId, period)))
          // By position: the time zone is a parameter (see ActivityService.stats).
          .groupBy(sql`1`);
        return days.length
          ? [
              {
                key: 'tasks.done',
                module: 'tasks',
                labelKey: 'tasks.links.done',
                unit: 'count',
                days: days.map(({ day: date, done }) => ({ day: date, value: done })),
              },
            ]
          : [];
      },
    });

    this.links.registerPages([
      { module: 'tasks', path: '/tasks/todo', description: 'the TODO list' },
      { module: 'tasks', path: '/tasks/reminders', description: 'reminders' },
    ]);
  }

  /** Done on the user's own days of a period. */
  private async doneWithin(userId: string, period: { from: LocalDate; to: LocalDate }) {
    const timeZone = await this.timeZone(userId);
    const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
    return and(
      isNotNull(tasks.completedAt),
      gte(tasks.completedAt, zonedToUtc({ date: period.from, time: '00:00' }, timeZone)),
      lt(tasks.completedAt, zonedToUtc({ date: after, time: '00:00' }, timeZone)),
    );
  }

  private async timeZone(userId: string): Promise<string> {
    return this.users.timeZoneOf(await this.users.findById(userId));
  }
}
