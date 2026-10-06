import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { csvLine, DataExportService, DB, Database, ReadableFile } from '@pd/api-core';
import { projects } from '@pd/api-core/schema';
import { asc, eq } from 'drizzle-orm';
import { transactions } from './finance.schema';

/** With it at the start Excel reads the file as UTF-8. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** Finance in an archive of one's data: the transactions as a CSV any spreadsheet opens. */
@Injectable()
export class FinanceExport implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly exporter: DataExportService,
  ) {}

  onModuleInit(): void {
    this.exporter.register({ module: 'finance', files: (userId) => this.files(userId) });
  }

  private async *files(userId: string): AsyncGenerator<ReadableFile> {
    const rows = await this.db
      .select({
        date: transactions.occurredOn,
        kind: transactions.kind,
        amount: transactions.amount,
        currency: transactions.currency,
        category: transactions.category,
        note: transactions.note,
        wallet: projects.name,
      })
      .from(transactions)
      .leftJoin(projects, eq(projects.id, transactions.projectId))
      .where(eq(transactions.userId, userId))
      .orderBy(asc(transactions.occurredOn), asc(transactions.createdAt));
    if (!rows.length) {
      return;
    }
    const header = csvLine(['date', 'kind', 'amount', 'currency', 'category', 'note', 'wallet']);
    const lines = rows.map((row) =>
      csvLine([
        row.date,
        row.kind,
        row.amount.toFixed(2),
        row.currency,
        row.category,
        row.note,
        row.wallet ?? 'personal',
      ]),
    );
    yield { path: 'transactions.csv', content: `${BYTE_ORDER_MARK}${header}${lines.join('')}` };
  }
}
