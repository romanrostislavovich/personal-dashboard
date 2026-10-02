import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { contains, DB, Database, SEARCH_LIMIT, SearchService } from '@pd/api-core';
import { SearchHit } from '@pd/contracts';
import { and, desc, eq, or } from 'drizzle-orm';
import { trackedRepos } from './open-source.schema';

/** Repositories for the command palette: by the name and the description. */
@Injectable()
export class OpenSourceSearch implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly search: SearchService,
  ) {}

  onModuleInit(): void {
    this.search.register({
      module: 'development',
      search: (userId, query) => this.find(userId, query),
    });
  }

  private async find(userId: string, query: string): Promise<SearchHit[]> {
    const rows = await this.db
      .select()
      .from(trackedRepos)
      .where(
        and(
          eq(trackedRepos.userId, userId),
          or(contains(trackedRepos.fullName, query), contains(trackedRepos.description, query)),
        ),
      )
      .orderBy(desc(trackedRepos.stars))
      .limit(SEARCH_LIMIT);
    return rows.map((row) => ({
      module: 'development',
      kind: 'repository',
      title: row.fullName,
      subtitle: row.description,
      url: '/development/open-source',
    }));
  }
}
