import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LifeService } from '@pd/api-core';
import { LifeEvent } from '@pd/contracts';
import { and, eq } from 'drizzle-orm';
import { birthdays } from './birthdays.schema';

/** Whose birthday a day is, in the life timeline. */
@Injectable()
export class BirthdaysLife implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly life: LifeService,
  ) {}

  onModuleInit(): void {
    this.life.register({
      module: 'birthdays',
      day: async (userId, day): Promise<LifeEvent[]> => {
        const [, month, date] = day.split('-').map(Number);
        const rows = await this.db
          .select({ name: birthdays.name })
          .from(birthdays)
          .where(
            and(eq(birthdays.userId, userId), eq(birthdays.month, month), eq(birthdays.day, date)),
          );
        return rows.length
          ? [
              {
                module: 'birthdays',
                icon: 'cake',
                key: 'birthdays.life.day',
                params: { names: rows.map((row) => row.name).join(', ') },
                at: null,
                link: '/birthdays',
              },
            ]
          : [];
      },
    });
  }
}
