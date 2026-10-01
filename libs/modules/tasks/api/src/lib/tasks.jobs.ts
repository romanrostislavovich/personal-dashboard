import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerService, TelegramBotService, UserRow, UsersService } from '@pd/api-core';
import { taskInputSchema, zonedDateTime } from '@pd/contracts';
import { REMINDER_ACTION, RemindersService } from './reminders.service';
import { formatWhen, tasksMessages } from './tasks.messages';
import { TasksService } from './tasks.service';
import { parseWhen } from './when';

/** `#home` at the end or inside a task typed in Telegram becomes its tag. */
const HASHTAG = /(^|\s)#([^\s#]+)/g;

/**
 * What runs by itself and what the bot understands: reminders go out every minute; `/todo`,
 * `/remind` and `/tasks` in Telegram; the buttons under a reminder.
 */
@Injectable()
export class TasksJobs implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly telegram: TelegramBotService,
    private readonly users: UsersService,
    private readonly tasks: TasksService,
    private readonly reminders: RemindersService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'tasks.reminders',
      cron: '* * * * *',
      // Every minute: a line in the log for each run would drown everything else.
      quiet: true,
      handler: () => this.reminders.fireDue(),
    });

    this.telegram.registerAction({
      name: REMINDER_ACTION,
      handler: (user, payload) => this.reminders.answerButton(user, payload),
    });
    this.telegram.registerCommand({
      command: 'todo',
      description: {
        en: 'New task: /todo buy milk #home',
        ru: 'Новая задача: /todo купить молоко #дом',
      },
      handler: (user, text) => this.addTask(user, text),
    });
    this.telegram.registerCommand({
      command: 'remind',
      description: {
        en: 'Reminder: /remind tomorrow 9:00 call mum',
        ru: 'Напоминание: /remind завтра 9:00 позвонить маме',
      },
      handler: (user, text) => this.addReminder(user, text),
    });
    this.telegram.registerCommand({
      command: 'tasks',
      description: {
        en: 'Tasks for today and overdue ones',
        ru: 'Задачи на сегодня и просроченные',
      },
      handler: (user) => this.today(user),
    });
  }

  private async addTask(user: UserRow, text: string): Promise<string> {
    const messages = tasksMessages(user.locale);
    const tags = [...text.matchAll(HASHTAG)].map((match) => match[2]);
    const title = text.replace(HASHTAG, '$1').replace(/\s+/g, ' ').trim();
    const input = taskInputSchema.safeParse({ title, tags });
    if (!input.success) {
      return messages.todoUsage;
    }
    await this.tasks.create(user.id, input.data);
    return messages.todoAdded(input.data.title);
  }

  private async addReminder(user: UserRow, text: string): Promise<string> {
    const messages = tasksMessages(user.locale);
    const timeZone = this.users.timeZoneOf(user);
    const when = parseWhen(text, new Date(), timeZone);
    if (!when || !when.rest) {
      return messages.remindUsage;
    }
    await this.reminders.create(user.id, { text: when.rest, remindAt: when.at.toISOString() });
    return messages.remindAdded(formatWhen(when.at, timeZone, user.locale), when.rest);
  }

  /** Overdue and today's tasks by the user's own calendar. */
  private async today(user: UserRow): Promise<string> {
    const messages = tasksMessages(user.locale);
    const today = zonedDateTime(new Date(), this.users.timeZoneOf(user)).date;
    const open = (await this.tasks.list(user.id)).filter((task) => !task.completedAt);
    const section = (title: string, items: string[]) =>
      items.length ? `${title}:\n${items.map((item) => `• ${item}`).join('\n')}` : '';
    const reply = [
      section(
        messages.tasksOverdue,
        open.filter((task) => task.dueDate && task.dueDate < today).map((task) => task.title),
      ),
      section(
        messages.tasksToday,
        open.filter((task) => task.dueDate === today).map((task) => task.title),
      ),
    ]
      .filter(Boolean)
      .join('\n\n');
    return reply || messages.tasksNone;
  }
}
