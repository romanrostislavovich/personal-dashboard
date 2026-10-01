import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  BotActionReply,
  DB,
  Database,
  NotificationAction,
  NotificationsService,
  UserRow,
  UsersService,
} from '@pd/api-core';
import {
  addDays,
  addRepeat,
  parseLocalDate,
  Reminder,
  reminderInputSchema,
  reminderUpdateSchema,
  Repeat,
  toLocalDate,
  zonedDateTime,
  zonedToUtc,
} from '@pd/contracts';
import { and, asc, eq, gt, inArray, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { ReminderRow, reminders, tasks } from './tasks.schema';
import { formatWhen, tasksMessages } from './tasks.messages';
import { DEFAULT_TIME, parseWhen } from './when';

/** The name of the bot action: a button carries `rem:<what>:<reminder id>`. */
export const REMINDER_ACTION = 'rem';
/** Answered reminders stay on the page for this long. */
const DONE_SHOWN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Reminders sent in one run of the job: a backlog after downtime is worked off in portions. */
const FIRED_PER_RUN = 100;

type ValidReminder = z.output<typeof reminderInputSchema>;
type ValidReminderUpdate = z.output<typeof reminderUpdateSchema>;

/**
 * Reminders: a text sent at a moment, through notifications (Telegram shows buttons under it).
 * Times are stored as moments; the user's own clock is needed only for "tomorrow at 9:00" and
 * for the next time of a repeating reminder.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Waiting and sent ones, and the ones answered lately; the nearest first. */
  async list(userId: string): Promise<Reminder[]> {
    const rows = await this.db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, userId),
          or(
            inArray(reminders.status, ['scheduled', 'fired']),
            gt(reminders.firedAt, new Date(Date.now() - DONE_SHOWN_DAYS * DAY_MS)),
          ),
        ),
      )
      .orderBy(asc(reminders.remindAt));
    return rows.map(toReminder);
  }

  async create(userId: string, input: ValidReminder): Promise<Reminder> {
    if (input.taskId) {
      // 404 for a task of somebody else.
      const owned = await this.db.$count(
        tasks,
        and(eq(tasks.id, input.taskId), eq(tasks.userId, userId)),
      );
      if (!owned) {
        throw new NotFoundException('Task not found');
      }
    }
    const [row] = await this.db
      .insert(reminders)
      .values({
        userId,
        text: input.text,
        remindAt: new Date(input.remindAt),
        repeat: input.repeat ?? null,
        taskId: input.taskId ?? null,
      })
      .returning();
    return toReminder(row);
  }

  /** A new time puts an answered or sent reminder back to waiting. */
  async update(userId: string, id: string, changes: ValidReminderUpdate): Promise<void> {
    await this.find(userId, id);
    const { remindAt, ...rest } = changes;
    await this.db
      .update(reminders)
      .set({
        ...rest,
        ...(remindAt ? { remindAt: new Date(remindAt), status: 'scheduled' as const } : {}),
      })
      .where(eq(reminders.id, id));
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db.delete(reminders).where(and(eq(reminders.id, id), eq(reminders.userId, userId)));
  }

  async done(userId: string, id: string): Promise<void> {
    await this.find(userId, id);
    await this.db.update(reminders).set({ status: 'done' }).where(eq(reminders.id, id));
  }

  /** Remind again at another moment. */
  async snooze(userId: string, id: string, at: Date): Promise<void> {
    await this.find(userId, id);
    await this.db
      .update(reminders)
      .set({ remindAt: at, status: 'scheduled' })
      .where(eq(reminders.id, id));
  }

  /** How many reminders the user has answered "done" — for the achievements. */
  doneCount(userId: string): Promise<number> {
    return this.db.$count(
      reminders,
      and(eq(reminders.userId, userId), eq(reminders.status, 'done')),
    );
  }

  /** Sends every reminder whose time has come. Called by the job every minute. */
  async fireDue(now: Date = new Date()): Promise<void> {
    const due = await this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.status, 'scheduled'), lte(reminders.remindAt, now)))
      .orderBy(asc(reminders.remindAt))
      .limit(FIRED_PER_RUN);
    for (const reminder of due) {
      // One reminder failing (a user without channels, Telegram down) must not hold the others.
      await this.fire(reminder, now).catch((error) =>
        this.logger.warn(`Reminder ${reminder.id} was not sent: ${error}`),
      );
    }
  }

  /**
   * A button under the reminder in Telegram: `<what>:<id>` — done, an hour later, tomorrow
   * morning, or "another time", which asks for it and reads the user's next message.
   */
  async answerButton(user: UserRow, payload: string): Promise<BotActionReply> {
    const [what, id] = payload.split(':');
    const text = tasksMessages(user.locale);
    const reminder = await this.find(user.id, id).catch(() => null);
    if (!reminder) {
      return text.gone;
    }
    const timeZone = this.users.timeZoneOf(user);
    const snoozeTo = async (at: Date) => {
      await this.snooze(user.id, id, at);
      return text.snoozed(formatWhen(at, timeZone, user.locale));
    };
    switch (what) {
      case 'd':
        await this.done(user.id, id);
        return text.done;
      case 'h':
        return snoozeTo(new Date(Date.now() + HOUR_MS));
      case 't': {
        const today = zonedDateTime(new Date(), timeZone).date;
        const tomorrow = toLocalDate(addDays(parseLocalDate(today), 1));
        return snoozeTo(zonedToUtc({ date: tomorrow, time: DEFAULT_TIME }, timeZone));
      }
      default:
        return {
          reply: text.askWhen,
          expectText: async (_user, answer) => {
            const when = parseWhen(answer, new Date(), timeZone);
            return when ? snoozeTo(when.at) : text.notUnderstood;
          },
        };
    }
  }

  private async fire(reminder: ReminderRow, now: Date): Promise<void> {
    const user = await this.users.findById(reminder.userId);
    if (!user) {
      return;
    }
    const sent = reminder.repeat
      ? await this.advanceSeries(reminder, reminder.repeat, now, this.users.timeZoneOf(user))
      : await this.markFired(reminder, now);
    // Another run took it in the meantime.
    if (!sent) {
      return;
    }
    const text = tasksMessages(user.locale);
    const button = (label: string, what: string): NotificationAction => ({
      label,
      action: `${REMINDER_ACTION}:${what}:${sent.id}`,
    });
    await this.notifications.send(user.id, {
      title: text.reminderTitle,
      body: reminder.text,
      source: 'tasks',
      actions: [
        button(text.buttons.done, 'd'),
        button(text.buttons.hour, 'h'),
        button(text.buttons.tomorrow, 't'),
        button(text.buttons.other, 'o'),
      ],
    });
  }

  /** `scheduled` → `fired`, unless another run did it first. */
  private async markFired(reminder: ReminderRow, now: Date): Promise<ReminderRow | undefined> {
    const [row] = await this.db
      .update(reminders)
      .set({ status: 'fired', firedAt: now })
      .where(and(eq(reminders.id, reminder.id), eq(reminders.status, 'scheduled')))
      .returning();
    return row;
  }

  /**
   * A repeating reminder is a series: it moves to its next time (the same hour on the user's
   * clock, past `now`), and this occurrence becomes a reminder of its own for the user to answer.
   */
  private async advanceSeries(
    series: ReminderRow,
    repeat: Repeat,
    now: Date,
    timeZone: string,
  ): Promise<ReminderRow | undefined> {
    const local = zonedDateTime(series.remindAt, timeZone);
    let date = local.date;
    let next = series.remindAt;
    while (next <= now) {
      date = addRepeat(date, repeat);
      next = zonedToUtc({ date, time: local.time }, timeZone);
    }
    return this.db.transaction(async (tx) => {
      const [moved] = await tx
        .update(reminders)
        .set({ remindAt: next, firedAt: now })
        // Still at the time this run saw: nobody moved it meanwhile.
        .where(and(eq(reminders.id, series.id), eq(reminders.remindAt, series.remindAt)))
        .returning();
      if (!moved) {
        return undefined;
      }
      const [occurrence] = await tx
        .insert(reminders)
        .values({
          userId: series.userId,
          taskId: series.taskId,
          text: series.text,
          remindAt: series.remindAt,
          status: 'fired',
          firedAt: now,
        })
        .returning();
      return occurrence;
    });
  }

  private async find(userId: string, id: string): Promise<ReminderRow> {
    const [row] = await this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.id, id), eq(reminders.userId, userId)));
    if (!row) {
      throw new NotFoundException('Reminder not found');
    }
    return row;
  }
}

function toReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    text: row.text,
    remindAt: row.remindAt.toISOString(),
    repeat: row.repeat,
    status: row.status,
    taskId: row.taskId,
    firedAt: row.firedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
