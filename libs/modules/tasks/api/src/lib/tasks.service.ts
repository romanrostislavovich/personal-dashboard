import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, Database, isUniqueViolation, LinksService, UsersService } from '@pd/api-core';
import { projects } from '@pd/api-core/schema';
import {
  computeStreaks,
  LocalDate,
  nextRepeat,
  parseLocalDate,
  Task,
  taskInputSchema,
  TaskList,
  taskUpdateSchema,
  zonedDateTime,
} from '@pd/contracts';
import { and, asc, desc, eq, gt, inArray, isNull, min, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { reminders, taskLists, TaskRow, tasks } from './tasks.schema';

/** The highest of TASK_PRIORITIES. */
const TOP_PRIORITY = 3;

/** Done tasks stay on the page for this long; older ones are kept but not listed. */
const DONE_SHOWN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type ValidTask = z.output<typeof taskInputSchema>;
type ValidTaskUpdate = z.output<typeof taskUpdateSchema>;

/** The TODO list: tasks, the user's own lists and what happens when a task is done. */
@Injectable()
export class TasksService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly links: LinksService,
  ) {}

  // --- Lists ---

  async lists(userId: string): Promise<TaskList[]> {
    const rows = await this.db
      .select({
        id: taskLists.id,
        name: taskLists.name,
        open: sql<number>`count(${tasks.id}) FILTER (WHERE ${tasks.completedAt} IS NULL)::int`,
      })
      .from(taskLists)
      .leftJoin(tasks, eq(tasks.listId, taskLists.id))
      .where(eq(taskLists.userId, userId))
      .groupBy(taskLists.id)
      .orderBy(asc(taskLists.name));
    return rows;
  }

  async createList(userId: string, name: string): Promise<void> {
    await this.db
      .insert(taskLists)
      .values({ userId, name })
      .catch((error: unknown) => {
        throw isUniqueViolation(error) ? new BadRequestException('Such a list exists') : error;
      });
  }

  async renameList(userId: string, id: string, name: string): Promise<void> {
    await this.db
      .update(taskLists)
      .set({ name })
      .where(and(eq(taskLists.id, id), eq(taskLists.userId, userId)))
      .catch((error: unknown) => {
        throw isUniqueViolation(error) ? new BadRequestException('Such a list exists') : error;
      });
  }

  /** The tasks of a deleted list go back to the inbox (see the foreign key). */
  async removeList(userId: string, id: string): Promise<void> {
    await this.db.delete(taskLists).where(and(eq(taskLists.id, id), eq(taskLists.userId, userId)));
  }

  // --- Tasks ---

  /** Open tasks and the ones done lately, with the time of the nearest reminder of each. */
  async list(userId: string): Promise<Task[]> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          or(
            isNull(tasks.completedAt),
            gt(tasks.completedAt, new Date(Date.now() - DONE_SHOWN_DAYS * DAY_MS)),
          ),
        ),
      )
      // Open first: by due date (without one — last), then by priority.
      .orderBy(
        sql`${tasks.completedAt} IS NOT NULL`,
        sql`${tasks.dueDate} ASC NULLS LAST`,
        desc(tasks.priority),
        asc(tasks.createdAt),
      );
    const reminderAt = await this.nearestReminders(rows.map((row) => row.id));
    // The focus sessions belong to another section: the core tells the time of each title.
    const spent = await this.links.timeSpentOn(
      userId,
      rows.map((row) => row.title),
    );
    return rows.map((row) => {
      const time = spent.get(row.title.trim().toLowerCase());
      return {
        ...toTask(row, reminderAt.get(row.id) ?? null),
        focusSeconds: time?.focus ?? 0,
        windowSeconds: time?.windows ?? 0,
      };
    });
  }

  async find(userId: string, id: string): Promise<TaskRow> {
    const [row] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    if (!row) {
      throw new NotFoundException('Task not found');
    }
    return row;
  }

  async create(userId: string, input: ValidTask): Promise<Task> {
    await this.checkOwnership(userId, input);
    const [row] = await this.db
      .insert(tasks)
      .values({ userId, ...input })
      .returning();
    return toTask(row, null);
  }

  async update(userId: string, id: string, changes: ValidTaskUpdate): Promise<void> {
    const current = await this.find(userId, id);
    await this.checkOwnership(userId, changes);
    const dueDate = changes.dueDate === undefined ? current.dueDate : changes.dueDate;
    const repeat = changes.repeat === undefined ? current.repeat : changes.repeat;
    if (repeat && !dueDate) {
      throw new BadRequestException('A repeating task needs a due date');
    }
    await this.db.update(tasks).set(changes).where(eq(tasks.id, id));
  }

  /**
   * Marks the task done; its reminders are no longer needed. A repeating task comes back as a
   * new one on its next day (the first one after today on the user's own calendar).
   */
  async complete(userId: string, id: string): Promise<void> {
    const task = await this.find(userId, id);
    if (task.completedAt) {
      return;
    }
    const today = zonedDateTime(
      new Date(),
      this.users.timeZoneOf(await this.users.findById(userId)),
    ).date;
    await this.db.transaction(async (tx) => {
      await tx.update(tasks).set({ completedAt: new Date() }).where(eq(tasks.id, id));
      await tx
        .update(reminders)
        .set({ status: 'done' })
        .where(and(eq(reminders.taskId, id), inArray(reminders.status, ['scheduled', 'fired'])));
      if (task.repeat && task.dueDate) {
        const { id: _id, completedAt: _completedAt, createdAt: _createdAt, ...copy } = task;
        await tx.insert(tasks).values({
          ...copy,
          dueDate: nextRepeat(task.dueDate, task.repeat, today),
          checklist: task.checklist.map((item) => ({ ...item, done: false })),
        });
      }
    });
  }

  /** Back to the open ones. What a repeating task has already brought next stays. */
  async reopen(userId: string, id: string): Promise<void> {
    await this.find(userId, id);
    await this.db.update(tasks).set({ completedAt: null }).where(eq(tasks.id, id));
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  }

  /** How many tasks the user has done in total — for the achievements. */
  async completedCount(userId: string): Promise<number> {
    return this.db.$count(
      tasks,
      and(eq(tasks.userId, userId), sql`${tasks.completedAt} IS NOT NULL`),
    );
  }

  /** Done tasks by the user's own days — for the achievements. */
  async completionRecords(
    userId: string,
  ): Promise<{ bestDay: number; longestStreak: number; onTime: number; urgent: number }> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    const local = sql`(${tasks.completedAt} AT TIME ZONE ${timeZone})`;
    const rows = await this.db
      .select({
        day: sql<LocalDate>`to_char(${local}, 'YYYY-MM-DD')`,
        done: sql<number>`count(*)::int`,
        // Done on the day it was due or earlier.
        onTime: sql<number>`count(*) filter (where ${tasks.dueDate} >= ${local}::date)::int`,
        urgent: sql<number>`count(*) filter (where ${tasks.priority} = ${TOP_PRIORITY})::int`,
      })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), sql`${tasks.completedAt} IS NOT NULL`))
      .groupBy(sql`1`);
    const today = zonedDateTime(new Date(), timeZone).date;
    return {
      bestDay: Math.max(0, ...rows.map((row) => row.done)),
      longestStreak: computeStreaks(
        rows.map((row) => row.day),
        parseLocalDate(today),
      ).longest,
      onTime: rows.reduce((sum, row) => sum + row.onTime, 0),
      urgent: rows.reduce((sum, row) => sum + row.urgent, 0),
    };
  }

  /** A list or a project of somebody else must not be attached to a task. */
  private async checkOwnership(
    userId: string,
    { listId, projectId }: { listId?: string | null; projectId?: string | null },
  ): Promise<void> {
    if (
      listId &&
      !(await this.db.$count(
        taskLists,
        and(eq(taskLists.id, listId), eq(taskLists.userId, userId)),
      ))
    ) {
      throw new BadRequestException('List not found');
    }
    if (
      projectId &&
      !(await this.db.$count(
        projects,
        and(eq(projects.id, projectId), eq(projects.userId, userId)),
      ))
    ) {
      throw new BadRequestException('Project not found');
    }
  }

  private async nearestReminders(taskIds: string[]): Promise<Map<string, string>> {
    if (taskIds.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({ taskId: reminders.taskId, at: min(reminders.remindAt) })
      .from(reminders)
      .where(and(inArray(reminders.taskId, taskIds), eq(reminders.status, 'scheduled')))
      .groupBy(reminders.taskId);
    return new Map(
      rows.flatMap((row) => (row.taskId && row.at ? [[row.taskId, row.at.toISOString()]] : [])),
    );
  }
}

export function toTask(row: TaskRow, reminderAt: string | null): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueDate: row.dueDate,
    priority: row.priority,
    listId: row.listId,
    projectId: row.projectId,
    tags: row.tags,
    checklist: row.checklist,
    repeat: row.repeat,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    reminderAt,
    focusSeconds: 0,
    windowSeconds: 0,
  };
}
