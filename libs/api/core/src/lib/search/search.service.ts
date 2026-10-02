import { Injectable, Logger } from '@nestjs/common';
import { SearchHit } from '@pd/contracts';
import { sql, SQL } from 'drizzle-orm';
import { AnyColumn } from 'drizzle-orm';

/** How many hits a module gives at most: the palette shows a few of each, not a page. */
export const SEARCH_LIMIT = 5;

/**
 * A module's search: what of its data matches the query, the most relevant (usually the newest)
 * first, at most `SEARCH_LIMIT`. Registered in the module's `*.search.ts`.
 */
export interface SearchProvider {
  module: string;
  search(userId: string, query: string): Promise<SearchHit[]>;
}

/**
 * Search across everything (the command palette, Ctrl+K). Modules do not know about each other,
 * so each registers its own search here and the core asks them all.
 *
 * Example — libs/modules/tasks/api/src/lib/tasks.search.ts.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly providers: SearchProvider[] = [];

  register(provider: SearchProvider): void {
    this.providers.push(provider);
  }

  /** Hits of all modules, in the order the modules were registered. */
  async search(userId: string, query: string): Promise<SearchHit[]> {
    const found = await Promise.all(
      this.providers.map((provider) =>
        provider.search(userId, query).then(
          (hits) => hits.slice(0, SEARCH_LIMIT),
          (error) => {
            // One module failing must not leave the palette empty.
            this.logger.warn(`Search in ${provider.module} failed: ${error}`);
            return [];
          },
        ),
      ),
    );
    return found.flat();
  }
}

/** `column ILIKE '%query%'`; `%` and `_` typed by the user are literal characters. */
export function contains(column: AnyColumn | SQL, query: string): SQL {
  const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return sql`${column} ILIKE ${pattern}`;
}

/** The text around the first match, for a subtitle: `…before match after…`. */
export function snippet(text: string, query: string, radius = 40): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) {
    return flat.slice(0, radius * 2);
  }
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + query.length + radius);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}
