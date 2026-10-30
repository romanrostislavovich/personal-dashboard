import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {DB, Database, SEARCH_LIMIT, snippet, SearchService} from '@pd/api-core';
import {SearchHit} from '@pd/contracts';
import {desc, eq} from 'drizzle-orm';
import {hasText} from './diary-text';
import {diaryEntries} from './diary.schema';

/** Diary entries for the command palette: by their text (searched here — it is encrypted). */
@Injectable()
export class DiarySearch implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly search: SearchService,
  ) {}

  onModuleInit(): void {
    this.search.register({
      module: 'diary',
      search: (userId, query) => this.find(userId, query),
    });
  }

  private async find(userId: string, query: string): Promise<SearchHit[]> {
    const rows = await this.db
      .select({day: diaryEntries.day, content: diaryEntries.content})
      .from(diaryEntries)
      .where(eq(diaryEntries.userId, userId))
      .orderBy(desc(diaryEntries.day));
    return rows
      .filter(row => hasText(row.content, query))
      .slice(0, SEARCH_LIMIT)
      .map(row => ({
        module: 'diary',
        kind: 'entry',
        title: row.day,
        subtitle: snippet(row.content, query),
        url: '/diary',
      }));
  }
}
