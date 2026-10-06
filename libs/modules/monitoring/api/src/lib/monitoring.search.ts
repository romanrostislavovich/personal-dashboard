import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { contains, DB, Database, SEARCH_LIMIT, SearchService } from '@pd/api-core';
import { SearchHit } from '@pd/contracts';
import { and, eq } from 'drizzle-orm';
import { monitors } from './monitoring.schema';

/** Monitored sites for the command palette: by the address. */
@Injectable()
export class MonitoringSearch implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly search: SearchService,
  ) {}

  onModuleInit(): void {
    this.search.register({
      module: 'monitoring',
      search: (userId, query) => this.find(userId, query),
    });
  }

  private async find(userId: string, query: string): Promise<SearchHit[]> {
    const rows = await this.db
      .select({ url: monitors.url, status: monitors.status })
      .from(monitors)
      .where(and(eq(monitors.userId, userId), contains(monitors.url, query)))
      .limit(SEARCH_LIMIT);
    return rows.map((row) => ({
      module: 'monitoring',
      kind: 'monitor',
      title: row.url,
      subtitle: row.status,
      url: '/monitoring',
    }));
  }
}
