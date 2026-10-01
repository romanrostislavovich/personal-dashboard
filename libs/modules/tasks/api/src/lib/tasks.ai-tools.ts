import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  AiService,
  changedFields,
  findById,
  idParameters,
  NO_PARAMETERS,
  UsersService,
} from '@pd/api-core';
import {
  reminderInputSchema,
  repeatSchema,
  taskInputSchema,
  taskUpdateSchema,
  zonedDateTime,
  zonedToUtc,
} from '@pd/contracts';
import { z } from 'zod';
import { RemindersService } from './reminders.service';
import { TasksService } from './tasks.service';

const REPEAT = {
  type: 'object',
  description: 'How often it comes back: { every: 2, unit: "week" }; null — it does not repeat',
  properties: {
    every: { type: 'number' },
    unit: { type: 'string', enum: ['day', 'week', 'month', 'year'] },
  },
} as const;

/** Fields of a task, shared by adding and editing. */
const TASK_FIELDS = {
  title: { type: 'string' },
  notes: { type: 'string', description: 'Details; an empty string clears' },
  dueDate: { type: 'string', description: 'YYYY-MM-DD; null — no due date' },
  priority: { type: 'number', description: '0 none, 1 low, 2 medium, 3 high' },
  listId: { type: 'string', description: 'A list from tasks_list; null — the inbox' },
  tags: { type: 'array', items: { type: 'string' }, description: 'Tags without #' },
  repeat: REPEAT,
} as const;

/** The user's local time of a reminder, as the model writes it. */
const localTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/, 'Expected YYYY-MM-DD HH:mm');
const reminderArgs = z.object({
  text: z.string(),
  at: localTime,
  repeat: repeatSchema.nullable().optional(),
  taskId: z.uuid().nullable().optional(),
});

/** AI access to tasks and reminders: reading, adding, changing, completing, deleting. */
@Injectable()
export class TasksAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly users: UsersService,
    private readonly tasks: TasksService,
    private readonly reminders: RemindersService,
  ) {}

  onModuleInit(): void {
    this.registerTaskTools();
    this.registerReminderTools();
  }

  private registerTaskTools(): void {
    this.ai.registerTool({
      name: 'tasks_list',
      module: 'tasks',
      description:
        "The user's TODO list: open tasks and the ones done in the last month (id, title, notes, " +
        'due date, priority 0–3, tags, checklist, repeat, when done, the time of its reminder), ' +
        'and the lists they are sorted into (`listId` null — the inbox). Overdue = due before today.',
      parameters: NO_PARAMETERS,
      handler: async (userId) => ({
        lists: await this.tasks.lists(userId),
        tasks: await this.tasks.list(userId),
      }),
    });

    this.ai.registerTool({
      name: 'tasks_add',
      module: 'tasks',
      writes: true,
      description:
        'Adds a task to the TODO list. A repeating task needs a due date. To be told about it ' +
        'at a time, add a reminder with its id (reminders_add).',
      parameters: { type: 'object', properties: TASK_FIELDS, required: ['title'] },
      handler: async (userId, args) => this.tasks.create(userId, taskInputSchema.parse(args)),
    });

    const find = async (userId: string, args: Record<string, unknown>) =>
      findById(await this.tasks.list(userId), args['id'], 'Task');

    this.ai.registerTool({
      name: 'tasks_update',
      module: 'tasks',
      writes: true,
      description:
        'Changes a task: only the fields given. `done: true` marks it done (a repeating one comes ' +
        'back on its next day), `done: false` reopens it.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task id from tasks_list' },
          ...TASK_FIELDS,
          done: { type: 'boolean' },
        },
        required: ['id'],
      },
      handler: async (userId, args) => {
        const task = await find(userId, args);
        const { done, ...fields } = changedFields(args);
        if (Object.keys(fields).length > 0) {
          await this.tasks.update(userId, task.id, taskUpdateSchema.parse(fields));
        }
        if (done === true) {
          await this.tasks.complete(userId, task.id);
        } else if (done === false) {
          await this.tasks.reopen(userId, task.id);
        }
        return { updated: task.title };
      },
    });

    this.ai.registerTool({
      name: 'tasks_delete',
      module: 'tasks',
      writes: true,
      confirm: async (userId, args) => {
        const { title, dueDate } = await find(userId, args);
        return { title, dueDate };
      },
      description: 'Deletes a task (with its reminders). To finish a task, mark it done instead.',
      parameters: idParameters('Task id from tasks_list'),
      handler: async (userId, args) => {
        await this.tasks.remove(userId, (await find(userId, args)).id);
      },
    });
  }

  private registerReminderTools(): void {
    this.ai.registerTool({
      name: 'reminders_list',
      module: 'tasks',
      description:
        'Reminders: waiting ones (`scheduled`), sent and not answered yet (`fired`) and the ones ' +
        "answered lately (`done`). Times are in the user's local time (`at`), with `now` to " +
        'count from.',
      parameters: NO_PARAMETERS,
      handler: async (userId) => {
        const timeZone = await this.timeZone(userId);
        const local = (at: string | Date) => {
          const { date, time } = zonedDateTime(new Date(at), timeZone);
          return `${date} ${time}`;
        };
        return {
          now: local(new Date()),
          timeZone,
          reminders: (await this.reminders.list(userId)).map(({ remindAt, firedAt, ...rest }) => ({
            ...rest,
            at: local(remindAt),
            firedAt: firedAt && local(firedAt),
          })),
        };
      },
    });

    this.ai.registerTool({
      name: 'reminders_add',
      module: 'tasks',
      writes: true,
      description:
        'Sets a reminder: the text comes to Telegram and as a notification at the time. `at` is ' +
        'the user\'s local time; resolve "tomorrow", "in an hour" from `now` of reminders_list. ' +
        '`taskId` ties it to a task.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'What to remind about' },
          at: { type: 'string', description: 'YYYY-MM-DD HH:mm, local time of the user' },
          repeat: REPEAT,
          taskId: { type: 'string', description: 'Task id from tasks_list, if it is about a task' },
        },
        required: ['text', 'at'],
      },
      handler: async (userId, args) => {
        const { at, ...rest } = reminderArgs.parse(args);
        const remindAt = await this.toMoment(userId, at);
        const input = reminderInputSchema.parse({ ...rest, remindAt: remindAt.toISOString() });
        const reminder = await this.reminders.create(userId, input);
        return { id: reminder.id, text: reminder.text, at };
      },
    });

    const find = async (userId: string, args: Record<string, unknown>) =>
      findById(await this.reminders.list(userId), args['id'], 'Reminder');

    this.ai.registerTool({
      name: 'reminders_update',
      module: 'tasks',
      writes: true,
      description:
        'Changes a reminder: another text, another time (`at` — this is also how it is ' +
        'postponed), or `done: true` when the user has dealt with it.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Reminder id from reminders_list' },
          text: { type: 'string' },
          at: { type: 'string', description: 'YYYY-MM-DD HH:mm, local time of the user' },
          done: { type: 'boolean' },
        },
        required: ['id'],
      },
      handler: async (userId, args) => {
        const reminder = await find(userId, args);
        const text = typeof args['text'] === 'string' ? args['text'] : undefined;
        const at = typeof args['at'] === 'string' ? localTime.parse(args['at']) : undefined;
        if (text || at) {
          await this.reminders.update(userId, reminder.id, {
            ...(text ? { text } : {}),
            ...(at ? { remindAt: (await this.toMoment(userId, at)).toISOString() } : {}),
          });
        }
        if (args['done'] === true) {
          await this.reminders.done(userId, reminder.id);
        }
        return { updated: text ?? reminder.text };
      },
    });

    this.ai.registerTool({
      name: 'reminders_delete',
      module: 'tasks',
      writes: true,
      confirm: async (userId, args) => {
        const { text } = await find(userId, args);
        return { text };
      },
      description: 'Deletes a reminder (a repeating one — the whole series).',
      parameters: idParameters('Reminder id from reminders_list'),
      handler: async (userId, args) => {
        await this.reminders.remove(userId, (await find(userId, args)).id);
      },
    });
  }

  private async timeZone(userId: string): Promise<string> {
    return this.users.timeZoneOf(await this.users.findById(userId));
  }

  /** `2026-10-03 09:00` on the user's clock → the moment. */
  private async toMoment(userId: string, local: string): Promise<Date> {
    const [date, time] = local.split(/[ T]/);
    return zonedToUtc({ date, time }, await this.timeZone(userId));
  }
}
