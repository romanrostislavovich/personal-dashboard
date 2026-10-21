import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, RecallService } from '@pd/api-core';
import { eq } from 'drizzle-orm';
import { tasks } from './tasks.schema';

/** Tasks in search by meaning: open and done, with their notes and tags. */
@Injectable()
export class TasksRecall implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly recall: RecallService,
  ) {}

  onModuleInit(): void {
    this.recall.register({
      module: 'tasks',
      items: async (userId) =>
        (await this.db.select().from(tasks).where(eq(tasks.userId, userId))).map((task) => ({
          id: task.id,
          title: task.completedAt ? `${task.title} (done)` : task.title,
          text: [task.title, task.notes, task.tags.map((tag) => `#${tag}`).join(' ')]
            .filter(Boolean)
            .join('\n'),
          date: (task.completedAt ?? task.createdAt).toISOString().slice(0, 10),
          link: '/tasks/todo',
        })),
    });
  }
}
