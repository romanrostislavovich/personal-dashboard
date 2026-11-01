import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DB,
  Database,
  isUniqueViolation,
  LinksService,
  UsersService,
} from '@pd/api-core';
import {projects} from '@pd/api-core/schema';
import {
  computeStreaks,
  LocalDate,
  nextRepeat,
  parseLocalDate,
  Task,
  TaskDeleteSteps,
  taskGroupSchema,
  taskInputSchema,
  TaskList,
  TaskSteps,
  taskUpdateSchema,
  zonedDateTime,
} from '@pd/contracts';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  min,
  or,
  sql,
} from 'drizzle-orm';
import {alias} from 'drizzle-orm/pg-core';
import {z} from 'zod';
import {reminders, taskLists, TaskRow, tasks} from './tasks.schema';

/** The highest of TASK_PRIORITIES. */
const TOP_PRIORITY = 3;

/** A done task with this many steps or more is a big one (an achievement). */
const BIG_GROUP_STEPS = 10;

/** Done tasks stay on the page for this long; older ones are kept but not listed. */
const DONE_SHOWN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type ValidTask = z.output<typeof taskInputSchema>;
type ValidTaskUpdate = z.output<typeof taskUpdateSchema>;
type ValidTaskGroup = z.output<typeof taskGroupSchema>;
/** The database, or a transaction of it. */
type Db = Pick<Database, 'select' | 'update' | '$count'>;

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
      .values({userId, name})
      .catch((error: unknown) => {
        throw isUniqueViolation(error)
          ? new BadRequestException('Such a list exists')
          : error;
      });
  }

  async renameList(userId: string, id: string, name: string): Promise<void> {
    await this.db
      .update(taskLists)
      .set({name})
      .where(and(eq(taskLists.id, id), eq(taskLists.userId, userId)))
      .catch((error: unknown) => {
        throw isUniqueViolation(error)
          ? new BadRequestException('Such a list exists')
          : error;
      });
  }

  /** The tasks of a deleted list go back to the inbox (see the foreign key). */
  async removeList(userId: string, id: string): Promise<void> {
    await this.db
      .delete(taskLists)
      .where(and(eq(taskLists.id, id), eq(taskLists.userId, userId)));
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
            gt(
              tasks.completedAt,
              new Date(Date.now() - DONE_SHOWN_DAYS * DAY_MS),
            ),
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
    const reminderAt = await this.nearestReminders(rows.map(row => row.id));
    const steps = await this.stepsOf(userId);
    // The focus sessions belong to another section: the core tells the time of each title.
    const spent = await this.links.timeSpentOn(
      userId,
      rows.map(row => row.title),
    );
    return rows.map(row => {
      const time = spent.get(row.title.trim().toLowerCase());
      return {
        ...toTask(row, reminderAt.get(row.id) ?? null),
        steps: steps.get(row.id) ?? null,
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

  /** A new step takes the list and the project of its task unless told otherwise. */
  async create(userId: string, input: ValidTask): Promise<Task> {
    await this.checkOwnership(userId, input);
    const parent = input.parentId
      ? await this.checkParent(userId, null, input.parentId)
      : null;
    return this.db.transaction(async tx => {
      const [row] = await tx
        .insert(tasks)
        .values({
          userId,
          ...input,
          listId: input.listId === undefined ? parent?.listId : input.listId,
          projectId:
            input.projectId === undefined ? parent?.projectId : input.projectId,
        })
        .returning();
      if (parent?.completedAt) {
        await reopenRow(tx, userId, parent.id);
      }
      return toTask(row, null);
    });
  }

  /**
   * Makes the tasks steps of one task: an existing one, or a new one with the title (in their
   * list and project when they all share it). A task that has steps cannot become a step.
   */
  async group(userId: string, group: ValidTaskGroup): Promise<Task> {
    const ids = [...new Set(group.taskIds)].filter(id => id !== group.parentId);
    const members = ids.length
      ? await this.db
          .select()
          .from(tasks)
          .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids)))
      : [];
    if (members.length === 0 || members.length !== ids.length) {
      throw new BadRequestException('Task not found');
    }
    if (
      await this.db.$count(
        tasks,
        and(eq(tasks.userId, userId), inArray(tasks.parentId, ids)),
      )
    ) {
      throw new BadRequestException('A task with steps cannot be a step');
    }
    const existing = group.parentId
      ? await this.checkParent(userId, null, group.parentId)
      : null;
    const shared = (pick: (row: TaskRow) => string | null): string | null =>
      members.every(row => pick(row) === pick(members[0]))
        ? pick(members[0])
        : null;
    return this.db.transaction(async tx => {
      const parent =
        existing ??
        (
          await tx
            .insert(tasks)
            .values({
              userId,
              title: group.title as string,
              listId: shared(row => row.listId),
              projectId: shared(row => row.projectId),
            })
            .returning()
        )[0];
      await tx
        .update(tasks)
        .set({parentId: parent.id, updatedAt: new Date()})
        .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids)));
      if (parent.completedAt && members.some(row => !row.completedAt)) {
        await reopenRow(tx, userId, parent.id);
      }
      // The tasks they were taken out of may have only done steps left.
      const before = new Set(members.map(row => row.parentId));
      for (const oldParent of before) {
        if (oldParent && oldParent !== parent.id) {
          await settleParent(tx, userId, oldParent);
        }
      }
      return toTask(parent, null);
    });
  }

  async update(
    userId: string,
    id: string,
    changes: ValidTaskUpdate,
  ): Promise<void> {
    const current = await this.find(userId, id);
    await this.checkOwnership(userId, changes);
    const parent =
      changes.parentId && changes.parentId !== current.parentId
        ? await this.checkParent(userId, id, changes.parentId)
        : null;
    const dueDate =
      changes.dueDate === undefined ? current.dueDate : changes.dueDate;
    const repeat =
      changes.repeat === undefined ? current.repeat : changes.repeat;
    if (repeat && !dueDate) {
      throw new BadRequestException('A repeating task needs a due date');
    }
    await this.db.transaction(async tx => {
      await tx
        .update(tasks)
        .set({...changes, updatedAt: new Date()})
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
      if (parent?.completedAt && !current.completedAt) {
        await reopenRow(tx, userId, parent.id);
      }
      // Taken out of its task: the steps left there may all be done now.
      if (current.parentId && changes.parentId !== undefined) {
        await settleParent(tx, userId, current.parentId);
      }
    });
  }

  /**
   * Marks the task done; its reminders are no longer needed. A repeating task comes back as a
   * new one on its next day (the first one after today on the user's own calendar). A task with
   * steps is done with all of them; the last step done closes its task.
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
    await this.db.transaction(async tx => {
      const openSteps = await tx
        .select({id: tasks.id})
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            eq(tasks.parentId, id),
            isNull(tasks.completedAt),
          ),
        );
      const done = [id, ...openSteps.map(step => step.id)];
      await tx
        .update(tasks)
        .set({completedAt: new Date()})
        .where(and(inArray(tasks.id, done), eq(tasks.userId, userId)));
      await tx
        .update(reminders)
        .set({status: 'done'})
        .where(
          and(
            inArray(reminders.taskId, done),
            inArray(reminders.status, ['scheduled', 'fired']),
          ),
        );
      if (task.repeat && task.dueDate) {
        const {
          id: _id,
          completedAt: _completedAt,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          ...copy
        } = task;
        await tx.insert(tasks).values({
          ...copy,
          dueDate: nextRepeat(task.dueDate, task.repeat, today),
          checklist: task.checklist.map(item => ({...item, done: false})),
        });
      }
      if (task.parentId) {
        await settleParent(tx, userId, task.parentId);
      }
    });
  }

  /**
   * Back to the open ones. What a repeating task has already brought next stays. A reopened step
   * reopens its task; the steps of a reopened task stay as they are.
   */
  async reopen(userId: string, id: string): Promise<void> {
    const task = await this.find(userId, id);
    await this.db.transaction(async tx => {
      await reopenRow(tx, userId, id);
      if (task.parentId) {
        await reopenRow(tx, userId, task.parentId);
      }
    });
  }

  /**
   * Deletes the task (into the trash) with its steps, or — `keep` — takes the steps out first so
   * they stay as tasks of their own.
   */
  async remove(
    userId: string,
    id: string,
    steps: TaskDeleteSteps = 'delete',
  ): Promise<void> {
    await this.db.transaction(async tx => {
      const [task] = await tx
        .select({parentId: tasks.parentId})
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
      if (steps === 'keep') {
        await tx
          .update(tasks)
          .set({parentId: null, updatedAt: new Date()})
          .where(and(eq(tasks.userId, userId), eq(tasks.parentId, id)));
      }
      await tx
        .delete(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
      if (task?.parentId) {
        await settleParent(tx, userId, task.parentId);
      }
    });
  }

  /** How many tasks the user has done in total — for the achievements. */
  async completedCount(userId: string): Promise<number> {
    return this.db.$count(
      tasks,
      and(eq(tasks.userId, userId), sql`${tasks.completedAt} IS NOT NULL`),
    );
  }

  /**
   * Done tasks by their horizon — for the achievements: long-running ones, and short ones done on
   * the day they were added (by the user's own calendar).
   */
  async horizonRecords(
    userId: string,
  ): Promise<{long: number; shortSameDay: number}> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    const [row] = await this.db
      .select({
        long: sql<number>`count(*) filter (where ${tasks.horizon} = 'long')::int`,
        shortSameDay: sql<number>`count(*) filter (where ${tasks.horizon} = 'short'
          and (${tasks.completedAt} AT TIME ZONE ${timeZone})::date
            = (${tasks.createdAt} AT TIME ZONE ${timeZone})::date)::int`,
      })
      .from(tasks)
      .where(
        and(eq(tasks.userId, userId), sql`${tasks.completedAt} IS NOT NULL`),
      );
    return {long: row?.long ?? 0, shortSameDay: row?.shortSameDay ?? 0};
  }

  /** Done tasks by the user's own days — for the achievements. */
  async completionRecords(userId: string): Promise<{
    bestDay: number;
    longestStreak: number;
    onTime: number;
    urgent: number;
  }> {
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
      .where(
        and(eq(tasks.userId, userId), sql`${tasks.completedAt} IS NOT NULL`),
      )
      .groupBy(sql`1`);
    const today = zonedDateTime(new Date(), timeZone).date;
    return {
      bestDay: Math.max(0, ...rows.map(row => row.done)),
      longestStreak: computeStreaks(
        rows.map(row => row.day),
        parseLocalDate(today),
      ).longest,
      onTime: rows.reduce((sum, row) => sum + row.onTime, 0),
      urgent: rows.reduce((sum, row) => sum + row.urgent, 0),
    };
  }

  /** Done tasks with steps — for the achievements: how many, and how many had ten or more. */
  async groupRecords(userId: string): Promise<{done: number; big: number}> {
    const parent = alias(tasks, 'parent');
    const rows = await this.db
      .select({steps: sql<number>`count(*)::int`})
      .from(tasks)
      .innerJoin(parent, eq(parent.id, tasks.parentId))
      .where(and(eq(tasks.userId, userId), isNotNull(parent.completedAt)))
      .groupBy(tasks.parentId);
    return {
      done: rows.length,
      big: rows.filter(row => row.steps >= BIG_GROUP_STEPS).length,
    };
  }

  /**
   * The task a step goes into: the user's own and not a step itself; the step is not the task
   * itself and has no steps of its own (one level only).
   */
  private async checkParent(
    userId: string,
    taskId: string | null,
    parentId: string,
  ): Promise<TaskRow> {
    const [parent] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, parentId), eq(tasks.userId, userId)));
    if (!parent) {
      throw new BadRequestException('Task not found');
    }
    if (parent.parentId || parentId === taskId) {
      throw new BadRequestException('A step cannot have steps');
    }
    if (
      taskId &&
      (await this.db.$count(
        tasks,
        and(eq(tasks.userId, userId), eq(tasks.parentId, taskId)),
      ))
    ) {
      throw new BadRequestException('A task with steps cannot be a step');
    }
    return parent;
  }

  /** Steps by their task, the ones done long ago too. */
  private async stepsOf(userId: string): Promise<Map<string, TaskSteps>> {
    const rows = await this.db
      .select({
        parentId: tasks.parentId,
        total: sql<number>`count(*)::int`,
        done: sql<number>`count(${tasks.completedAt})::int`,
      })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNotNull(tasks.parentId)))
      .groupBy(tasks.parentId);
    return new Map(
      rows.flatMap(({parentId, total, done}) =>
        parentId ? [[parentId, {total, done}]] : [],
      ),
    );
  }

  /** A list or a project of somebody else must not be attached to a task. */
  private async checkOwnership(
    userId: string,
    {listId, projectId}: {listId?: string | null; projectId?: string | null},
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

  private async nearestReminders(
    taskIds: string[],
  ): Promise<Map<string, string>> {
    if (taskIds.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({taskId: reminders.taskId, at: min(reminders.remindAt)})
      .from(reminders)
      .where(
        and(
          inArray(reminders.taskId, taskIds),
          eq(reminders.status, 'scheduled'),
        ),
      )
      .groupBy(reminders.taskId);
    return new Map(
      rows.flatMap(row =>
        row.taskId && row.at ? [[row.taskId, row.at.toISOString()]] : [],
      ),
    );
  }
}

/** Back to the open ones. */
async function reopenRow(tx: Db, userId: string, id: string): Promise<void> {
  await tx
    .update(tasks)
    .set({completedAt: null})
    .where(
      and(
        eq(tasks.id, id),
        eq(tasks.userId, userId),
        isNotNull(tasks.completedAt),
      ),
    );
}

/** An open task whose steps are all done is done too. */
async function settleParent(
  tx: Db,
  userId: string,
  parentId: string,
): Promise<void> {
  const steps = and(eq(tasks.userId, userId), eq(tasks.parentId, parentId));
  const all = await tx.$count(tasks, steps);
  const open = await tx.$count(tasks, and(steps, isNull(tasks.completedAt)));
  if (all > 0 && open === 0) {
    await tx
      .update(tasks)
      .set({completedAt: new Date()})
      .where(
        and(
          eq(tasks.id, parentId),
          eq(tasks.userId, userId),
          isNull(tasks.completedAt),
        ),
      );
  }
}

function toTask(row: TaskRow, reminderAt: string | null): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueDate: row.dueDate,
    priority: row.priority,
    horizon: row.horizon,
    listId: row.listId,
    projectId: row.projectId,
    parentId: row.parentId,
    steps: null,
    tags: row.tags,
    checklist: row.checklist,
    repeat: row.repeat,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
    reminderAt,
    focusSeconds: 0,
    windowSeconds: 0,
  };
}
