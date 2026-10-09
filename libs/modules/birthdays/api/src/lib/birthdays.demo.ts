import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, DemoService } from '@pd/api-core';
import { birthdays } from './birthdays.schema';

/** The demo data of Birthdays: a few people, the nearest in a few days. */
@Injectable()
export class BirthdaysDemo implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly demo: DemoService,
  ) {}

  onModuleInit(): void {
    this.demo.register({
      module: 'birthdays',
      seed: async ({ userId, daysAgo }) => {
        // In so many days from today: `daysAgo` of a negative number is a day ahead.
        const on = (daysAhead: number) => {
          const [, month, day] = daysAgo(-daysAhead).split('-').map(Number);
          return { month, day };
        };
        await this.db.insert(birthdays).values([
          { userId, name: 'Mia', ...on(5), year: 1994, note: 'Likes tea and ceramics' },
          { userId, name: 'Tom', ...on(19), year: 1990 },
          { userId, name: 'Grandma', ...on(80), year: 1948 },
          { userId, name: 'Sam', ...on(140) },
        ]);
      },
    });
  }
}
