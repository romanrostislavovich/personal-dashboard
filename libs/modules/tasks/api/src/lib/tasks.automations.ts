import { Injectable, OnModuleInit } from '@nestjs/common';
import { AutomationsService, UsersService } from '@pd/api-core';
import {
  addDays,
  parseLocalDate,
  reminderInputSchema,
  taskInputSchema,
  toLocalDate,
  zonedDateTime,
} from '@pd/contracts';
import { RemindersService } from './reminders.service';
import { TasksService } from './tasks.service';

/** Overdue tasks are listed up to this many in a message. */
const TITLES = 5;

/** Tasks in the rules "if X, then Y": overdue tasks at a time; a new task; a reminder. */
@Injectable()
export class TasksAutomations implements OnModuleInit {
  constructor(
    private readonly automations: AutomationsService,
    private readonly tasks: TasksService,
    private readonly reminders: RemindersService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.automations.registerTrigger({
      id: 'tasks.overdue',
      module: 'tasks',
      labelKey: 'tasks.automations.overdue',
      description: 'At a time of the user, if some tasks are past their due date',
      params: [{ name: 'time', type: 'time', labelKey: 'tasks.automations.time', required: true }],
      variables: ['count', 'titles'],
      check: async (userId, params, now) => {
        if (now.time < params['time']) {
          return null;
        }
        const overdue = (await this.tasks.list(userId)).filter(
          (task) => !task.completedAt && task.dueDate && task.dueDate < now.date,
        );
        return overdue.length
          ? {
              count: String(overdue.length),
              titles: overdue
                .slice(0, TITLES)
                .map((task) => task.title)
                .join(', '),
            }
          : null;
      },
    });

    this.automations.registerAction({
      id: 'tasks.create',
      module: 'tasks',
      labelKey: 'tasks.automations.create',
      description: 'Add a task to the TODO list, due today, tomorrow or with no date',
      params: [
        {
          name: 'title',
          type: 'text',
          labelKey: 'tasks.automations.title',
          required: true,
          template: true,
        },
        {
          name: 'due',
          type: 'select',
          labelKey: 'tasks.automations.due',
          options: [
            { value: 'none', labelKey: 'tasks.automations.dues.none' },
            { value: 'today', labelKey: 'tasks.automations.dues.today' },
            { value: 'tomorrow', labelKey: 'tasks.automations.dues.tomorrow' },
          ],
        },
      ],
      run: async (userId, params) => {
        const today = await this.today(userId);
        const dueDate =
          params['due'] === 'today'
            ? today
            : params['due'] === 'tomorrow'
              ? toLocalDate(addDays(parseLocalDate(today), 1))
              : null;
        await this.tasks.create(userId, taskInputSchema.parse({ title: params['title'], dueDate }));
      },
    });

    this.automations.registerAction({
      id: 'tasks.remind',
      module: 'tasks',
      labelKey: 'tasks.automations.remind',
      description: 'Remind the user of a text in some minutes (0 — right away)',
      params: [
        {
          name: 'text',
          type: 'text',
          labelKey: 'tasks.automations.text',
          required: true,
          template: true,
        },
        {
          name: 'inMinutes',
          type: 'number',
          labelKey: 'tasks.automations.inMinutes',
          required: true,
        },
      ],
      run: async (userId, params) => {
        const minutes = Math.max(0, Number(params['inMinutes']) || 0);
        await this.reminders.create(
          userId,
          reminderInputSchema.parse({
            text: params['text'],
            remindAt: new Date(Date.now() + minutes * 60_000).toISOString(),
          }),
        );
      },
    });
  }

  private async today(userId: string): Promise<string> {
    const user = await this.users.findById(userId);
    return zonedDateTime(new Date(), this.users.timeZoneOf(user)).date;
  }
}
