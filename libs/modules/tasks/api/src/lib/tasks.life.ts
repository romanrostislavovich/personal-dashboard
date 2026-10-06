import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LifeService, localDaysRange, UsersService } from '@pd/api-core';
import { LifeCard, LifeEvent } from '@pd/contracts';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { tasks } from './tasks.schema';

/** The titles of a day's done tasks shown at most. */
const TITLES = 5;

/** Tasks in the life timeline (what was done) and in the summaries (how many). */
@Injectable()
export class TasksLife implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly life: LifeService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.life.register({
      module: 'tasks',
      day: async (userId, day): Promise<LifeEvent[]> => {
        const done = await this.done(userId, { from: day, to: day });
        return done.length
          ? [
              {
                module: 'tasks',
                icon: 'task_alt',
                key: 'tasks.life.done',
                params: {
                  count: done.length,
                  titles: done
                    .slice(0, TITLES)
                    .map((task) => task.title)
                    .join(', '),
                },
                at: done[done.length - 1].completedAt?.toISOString() ?? null,
                link: '/tasks',
              },
            ]
          : [];
      },
      period: async (userId, period): Promise<LifeCard[]> => {
        const done = await this.done(userId, period);
        return done.length
          ? [
              {
                module: 'tasks',
                icon: 'task_alt',
                key: 'tasks.life.doneTotal',
                value: done.length,
                format: 'number',
              },
            ]
          : [];
      },
    });
  }

  private async done(userId: string, period: { from: string; to: string }) {
    const { start, end } = localDaysRange(
      this.users.timeZoneOf(await this.users.findById(userId)),
      period,
    );
    return this.db
      .select({ title: tasks.title, completedAt: tasks.completedAt })
      .from(tasks)
      .where(
        and(eq(tasks.userId, userId), gte(tasks.completedAt, start), lt(tasks.completedAt, end)),
      )
      .orderBy(asc(tasks.completedAt));
  }
}
