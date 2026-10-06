import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { contains, DB, Database, SEARCH_LIMIT, snippet, SearchService } from '@pd/api-core';
import { SearchHit } from '@pd/contracts';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { reminders, tasks } from './tasks.schema';

/** Tasks and reminders for the command palette: by the title, the notes and the tags. */
@Injectable()
export class TasksSearch implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly search: SearchService,
  ) {}

  onModuleInit(): void {
    this.search.register({ module: 'tasks', search: (userId, query) => this.find(userId, query) });
  }

  private async find(userId: string, query: string): Promise<SearchHit[]> {
    const found = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          or(
            contains(tasks.title, query),
            contains(tasks.notes, query),
            contains(sql`array_to_string(${tasks.tags}, ' ')`, query),
          ),
        ),
      )
      // Open tasks first, the newest of each kind on top.
      .orderBy(sql`${tasks.completedAt} IS NOT NULL`, desc(tasks.createdAt))
      .limit(SEARCH_LIMIT);
    const reminded = await this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.userId, userId), contains(reminders.text, query)))
      .orderBy(desc(reminders.remindAt))
      .limit(SEARCH_LIMIT);
    return [
      ...found.map((task) => ({
        module: 'tasks',
        kind: task.completedAt ? 'task-done' : 'task',
        title: task.title,
        subtitle: task.notes ? snippet(task.notes, query) : task.dueDate,
        url: '/tasks/todo',
      })),
      ...reminded.map((reminder) => ({
        module: 'tasks',
        kind: 'reminder',
        title: reminder.text,
        subtitle: reminder.remindAt.toISOString(),
        url: '/tasks/reminders',
      })),
    ];
  }
}
