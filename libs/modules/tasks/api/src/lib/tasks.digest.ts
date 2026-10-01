import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService, UsersService } from '@pd/api-core';
import { zonedDateTime } from '@pd/contracts';
import { TasksService } from './tasks.service';

/** Tasks in the morning digest: what is due today and what is overdue. */
@Injectable()
export class TasksDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly users: UsersService,
    private readonly tasks: TasksService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'tasks.today',
      module: 'tasks',
      description:
        'The TODO list: titles of the tasks due `today` and of the `overdue` ones (high priority ' +
        "first). List today's tasks and remind about the overdue ones in a line.",
      // The plan of the day is told every morning it exists, changed or not.
      always: true,
      collect: async (userId) => {
        const today = zonedDateTime(
          new Date(),
          this.users.timeZoneOf(await this.users.findById(userId)),
        ).date;
        const open = (await this.tasks.list(userId))
          .filter((task) => !task.completedAt && task.dueDate && task.dueDate <= today)
          .sort((a, b) => b.priority - a.priority);
        if (open.length === 0) {
          return null;
        }
        return {
          today: open.filter((task) => task.dueDate === today).map((task) => task.title),
          overdue: open
            .filter((task) => task.dueDate !== today)
            .map((task) => ({ title: task.title, dueDate: task.dueDate })),
        };
      },
    });
  }
}
