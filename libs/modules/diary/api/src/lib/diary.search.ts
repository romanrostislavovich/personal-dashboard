import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { contains, DB, Database, SEARCH_LIMIT, snippet, SearchService } from '@pd/api-core';
import { SearchHit } from '@pd/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { diaryEntries } from './diary.schema';

/** Diary entries for the command palette: by their text. */
@Injectable()
export class DiarySearch implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly search: SearchService,
  ) {}

  onModuleInit(): void {
    this.search.register({ module: 'diary', search: (userId, query) => this.find(userId, query) });
  }

  private async find(userId: string, query: string): Promise<SearchHit[]> {
    const rows = await this.db
      .select({ day: diaryEntries.day, content: diaryEntries.content })
      .from(diaryEntries)
      .where(and(eq(diaryEntries.userId, userId), contains(diaryEntries.content, query)))
      .orderBy(desc(diaryEntries.day))
      .limit(SEARCH_LIMIT);
    return rows.map((row) => ({
      module: 'diary',
      kind: 'entry',
      title: row.day,
      subtitle: snippet(row.content, query),
      url: '/diary',
    }));
  }
}
