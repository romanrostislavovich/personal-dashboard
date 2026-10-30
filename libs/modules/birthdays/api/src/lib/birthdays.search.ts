import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {DB, Database, SEARCH_LIMIT, SearchService} from '@pd/api-core';
import {SearchHit} from '@pd/contracts';
import {asc, eq} from 'drizzle-orm';
import {birthdays} from './birthdays.schema';

/** Birthdays for the command palette: by the name and the note (searched here — it is encrypted). */
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
    const wanted = query.toLowerCase();
    const rows = (
      await this.db
        .select()
        .from(birthdays)
        .where(eq(birthdays.userId, userId))
        .orderBy(asc(birthdays.name))
    )
      .filter(row =>
        `${row.name}
${row.note ?? ''}`
          .toLowerCase()
          .includes(wanted),
      )
      .slice(0, SEARCH_LIMIT);
    const two = (value: number) => String(value).padStart(2, '0');
    return rows.map(row => ({
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
