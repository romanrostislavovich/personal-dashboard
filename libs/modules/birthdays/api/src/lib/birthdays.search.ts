import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { contains, DB, Database, SEARCH_LIMIT, SearchService } from '@pd/api-core';
import { SearchHit } from '@pd/contracts';
import { and, asc, eq, or } from 'drizzle-orm';
import { birthdays } from './birthdays.schema';

/** Birthdays for the command palette: by the name and the note. */
@Injectable()
export class BirthdaysSearch implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly search: SearchService,
  ) {}

  onModuleInit(): void {
    this.search.register({
      module: 'birthdays',
      search: (userId, query) => this.find(userId, query),
    });
  }

  private async find(userId: string, query: string): Promise<SearchHit[]> {
    const rows = await this.db
      .select()
      .from(birthdays)
      .where(
        and(
          eq(birthdays.userId, userId),
          or(contains(birthdays.name, query), contains(birthdays.note, query)),
        ),
      )
      .orderBy(asc(birthdays.name))
      .limit(SEARCH_LIMIT);
    const two = (value: number) => String(value).padStart(2, '0');
    return rows.map((row) => ({
      module: 'birthdays',
      kind: 'birthday',
      title: row.name,
      // The birthday; for someone kept only for the day of memory — that day.
      subtitle:
        row.day && row.month
          ? `${two(row.day)}.${two(row.month)}${row.year ? `.${row.year}` : ''}`
          : `† ${two(row.deathDay ?? 0)}.${two(row.deathMonth ?? 0)}${row.deathYear ? `.${row.deathYear}` : ''}`,
      url: '/birthdays',
    }));
  }
}
