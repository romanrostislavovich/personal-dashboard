import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, RecallService } from '@pd/api-core';
import { eq } from 'drizzle-orm';
import { birthdays } from './birthdays.schema';

/** People in search by meaning: a name with the note about them, read decrypted. */
@Injectable()
export class BirthdaysRecall implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly recall: RecallService,
  ) {}

  onModuleInit(): void {
    this.recall.register({
      module: 'birthdays',
      items: async (userId) =>
        (await this.db.select().from(birthdays).where(eq(birthdays.userId, userId)))
          .filter((row) => row.note?.trim())
          .map((row) => ({
            id: row.id,
            title: row.name,
            text: `${row.name}\n${row.note ?? ''}`,
            date: null,
            link: '/birthdays',
          })),
    });
  }
}
