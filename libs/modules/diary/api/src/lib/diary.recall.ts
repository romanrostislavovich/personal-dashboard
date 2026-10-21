import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, RecallService } from '@pd/api-core';
import { desc, eq } from 'drizzle-orm';
import { diaryEntries } from './diary.schema';

/** The diary in search by meaning: every entry, read decrypted (the column decrypts itself). */
@Injectable()
export class DiaryRecall implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly recall: RecallService,
  ) {}

  onModuleInit(): void {
    this.recall.register({
      module: 'diary',
      items: async (userId) =>
        (
          await this.db
            .select({ day: diaryEntries.day, content: diaryEntries.content })
            .from(diaryEntries)
            .where(eq(diaryEntries.userId, userId))
            .orderBy(desc(diaryEntries.day))
        )
          .filter((row) => row.content.trim())
          .map((row) => ({
            id: row.day,
            title: `Diary, ${row.day}`,
            text: row.content,
            date: row.day,
            link: `/diary?day=${row.day}`,
          })),
    });
  }
}
