import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, DemoService } from '@pd/api-core';
import { tasks } from './tasks.schema';

const HOUR_MS = 60 * 60 * 1000;

/** The demo data of Tasks: a few for today, a few ahead, some done. */
@Injectable()
export class TasksDemo implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly demo: DemoService,
  ) {}

  onModuleInit(): void {
    this.demo.register({
      module: 'tasks',
      seed: async ({ userId, today, daysAgo, projects }) => {
        const done = (hoursAgo: number) => new Date(Date.now() - hoursAgo * HOUR_MS);
        await this.db.insert(tasks).values([
          { userId, title: 'Send the invoice to the supplier', dueDate: today, priority: 3 },
          {
            userId,
            title: 'Write the release notes',
            dueDate: today,
            priority: 2,
            projectId: projects.shop,
          },
          { userId, title: 'Book the dentist', dueDate: today, priority: 1 },
          {
            userId,
            title: 'Renew the domain',
            dueDate: daysAgo(-3),
            priority: 2,
            projectId: projects.blog,
          },
          { userId, title: 'Plan the trip to Japan', tags: ['someday'] },
          // The focus sessions of Activity name these two: they show their time.
          {
            userId,
            title: 'Fix checkout rounding',
            projectId: projects.shop,
            completedAt: done(3),
          },
          {
            userId,
            title: 'Reply to the customer',
            projectId: projects.shop,
            completedAt: done(5),
          },
          { userId, title: 'Order new tea samples', completedAt: done(30) },
        ]);
      },
    });
  }
}
