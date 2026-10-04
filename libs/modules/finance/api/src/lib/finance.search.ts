import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { contains, DB, Database, SEARCH_LIMIT, SearchService } from '@pd/api-core';
import { SearchHit } from '@pd/contracts';
import { and, desc, eq, or } from 'drizzle-orm';
import { recurringPayments, transactions, wishes } from './finance.schema';

/**
 * Transactions, recurring payments and wishes for the command palette: by the note, the category
 * and the name.
 */
@Injectable()
export class FinanceSearch implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly search: SearchService,
  ) {}

  onModuleInit(): void {
    this.search.register({
      module: 'finance',
      search: (userId, query) => this.find(userId, query),
    });
  }

  private async find(userId: string, query: string): Promise<SearchHit[]> {
    const found = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          or(contains(transactions.note, query), contains(transactions.category, query)),
        ),
      )
      .orderBy(desc(transactions.occurredOn))
      .limit(SEARCH_LIMIT);
    const recurring = await this.db
      .select()
      .from(recurringPayments)
      .where(and(eq(recurringPayments.userId, userId), contains(recurringPayments.name, query)))
      .limit(SEARCH_LIMIT);
    const wished = await this.db
      .select()
      .from(wishes)
      .where(and(eq(wishes.userId, userId), contains(wishes.name, query)))
      .limit(SEARCH_LIMIT);
    return [
      ...found.map((row) => ({
        module: 'finance',
        kind: row.kind,
        title: row.note || row.category,
        subtitle: `${row.occurredOn} · ${row.amount} ${row.currency} · ${row.category}`,
        url: '/finance',
      })),
      ...recurring.map((row) => ({
        module: 'finance',
        kind: 'recurring',
        title: row.name,
        subtitle: row.category,
        url: '/finance',
      })),
      ...wished.map((row) => ({
        module: 'finance',
        kind: 'wish',
        title: row.name,
        subtitle:
          row.price === null
            ? new URL(row.url).hostname
            : `${row.price.toFixed(2)} ${row.currency}`,
        url: '/finance?tab=wishlist',
      })),
    ];
  }
}
