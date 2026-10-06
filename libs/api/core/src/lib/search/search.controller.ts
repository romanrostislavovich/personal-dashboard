import { Controller, Get, Inject, OnModuleInit, Query } from '@nestjs/common';
import { SearchHit, searchQuerySchema } from '@pd/contracts';
import { and, desc, eq, or } from 'drizzle-orm';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { DB, Database } from '../database/database.module';
import { projects } from '../projects/projects.schema';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { contains, SEARCH_LIMIT, SearchService } from './search.service';

/** Search across all modules — for the command palette. */
@Controller('search')
export class SearchController implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly search: SearchService,
  ) {}

  /** The core's own data: projects. */
  onModuleInit(): void {
    this.search.register({
      module: 'projects',
      search: async (userId, query) => {
        const rows = await this.db
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.userId, userId),
              or(
                contains(projects.name, query),
                contains(projects.url, query),
                contains(projects.description, query),
              ),
            ),
          )
          .orderBy(desc(projects.createdAt))
          .limit(SEARCH_LIMIT);
        return rows.map((row) => ({
          module: 'projects',
          kind: 'project',
          title: row.name,
          subtitle: row.url ?? row.description,
          url: '/projects',
        }));
      },
    });
  }

  @Get()
  find(
    @CurrentUser() user: AuthUser,
    @Query('q', new ZodValidationPipe(searchQuerySchema)) query: string,
  ): Promise<SearchHit[]> {
    return this.search.search(user.id, query);
  }
}
