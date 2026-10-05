import { Inject, Injectable } from '@nestjs/common';
import { DATA_ARCHIVE_FORMAT, DataArchiveManifest } from '@pd/contracts';
import { sql, SQL } from 'drizzle-orm';
import { Writable } from 'node:stream';
import { DB, Database } from '../database/database.module';
import { ArchiveWriter, binaryPath, FileReference, MANIFEST_PATH, tablePath } from './data-archive';
import { exportable, ExportTable, ownedBy, readExportTables } from './export-catalog';

/** Rows read from the database at a time; rows with photos — a few, they are large. */
const ROWS_AT_A_TIME = 2000;
const BINARY_ROWS_AT_A_TIME = 10;

/** A file of an archive meant for reading with other programs. */
export interface ReadableFile {
  /** `finance/transactions.csv`: inside the folder of its module. */
  path: string;
  content: string;
}

/**
 * Copies of a module's data in formats other programs open — CSV for a spreadsheet, Markdown for
 * notes. The rows themselves are exported without the module doing anything; an import reads
 * only them.
 */
export interface ReadableExport {
  module: string;
  files(userId: string): AsyncIterable<ReadableFile>;
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Everything a user keeps in the dashboard as one ZIP (see data-archive.ts for its layout).
 * The tables are taken from the database catalog, so a new module is exported without a line of
 * code; whose a row is decides `ownership` (export-catalog.ts). Accounts, passwords and the
 * tokens of integrations never get into an archive.
 */
@Injectable()
export class DataExportService {
  private readonly readable: ReadableExport[] = [];

  constructor(@Inject(DB) private readonly db: Database) {}

  /** Called by a module (`*.export.ts`) that adds files to read. */
  register(source: ReadableExport): void {
    this.readable.push(source);
  }

  /** Writes the archive of a user's data into `output` and ends it. */
  async write(userId: string, output: Writable): Promise<void> {
    const archive = new ArchiveWriter(output);
    // One snapshot: rows that reference each other are exported as they were at one moment.
    await this.db.transaction(
      async (tx) => {
        const tables = exportable(await readExportTables(tx)).map(({ table, owned }) => ({
          table,
          mine: ownedBy(owned, 't', userId),
        }));
        const manifest: DataArchiveManifest = {
          format: DATA_ARCHIVE_FORMAT,
          exportedAt: new Date().toISOString(),
          tables: {},
        };
        for (const { table, mine } of tables) {
          const { rows } = await tx.execute<{ rows: number }>(
            sql`SELECT count(*)::int AS rows FROM ${sql.identifier(table.name)} t WHERE ${mine}`,
          );
          if (rows[0].rows > 0) {
            manifest.tables[table.name] = rows[0].rows;
          }
        }
        await archive.file(MANIFEST_PATH, (push) => push(JSON.stringify(manifest, null, 2)));
        for (const { table, mine } of tables.filter(({ table: t }) => manifest.tables[t.name])) {
          await this.writeTable(tx, archive, table, mine);
        }
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    for (const source of this.readable) {
      for await (const file of source.files(userId)) {
        await archive.file(`${source.module}/${file.path}`, (push) => push(file.content));
      }
    }
    await archive.end();
  }

  /** The rows of a table as lines of JSON, then its binary columns as files. */
  private async writeTable(
    tx: Transaction,
    archive: ArchiveWriter,
    table: ExportTable,
    mine: SQL,
  ): Promise<void> {
    const name = sql.identifier(table.name);
    // Binary columns are left out of the row: a reference to a file takes their place.
    const row = sql`(to_jsonb(t) - ${`{${table.binary.join(',')}}`}::text[])`;
    // `true` where the column has content: only such a row gets the reference.
    const filled = table.binary.map(
      (column) =>
        sql`|| jsonb_build_object(${column}::text, t.${sql.identifier(column)} IS NOT NULL)`,
    );
    await archive.file(tablePath(table.name), async (push) => {
      const select = sql`SELECT (${row} ${sql.join(filled, sql` `)})::text AS row
        FROM ${name} t WHERE ${mine}`;
      for await (const rows of cursor<{ row: string }>(tx, select, ROWS_AT_A_TIME)) {
        const lines = table.binary.length
          ? rows.map((item) => JSON.stringify(withFileReferences(table, JSON.parse(item.row))))
          : rows.map((item) => item.row);
        await push(lines.join('\n') + '\n');
      }
    });
    for (const column of table.binary) {
      const select = sql`SELECT ${row} AS row, t.${sql.identifier(column)} AS content
        FROM ${name} t WHERE ${mine}`;
      type BinaryRow = { row: Record<string, unknown>; content: Buffer | null };
      for await (const rows of cursor<BinaryRow>(tx, select, BINARY_ROWS_AT_A_TIME)) {
        for (const item of rows.filter((r) => r.content)) {
          const path = binaryPath(table.name, table.primaryKey, column, item.row);
          await archive.file(path, (push) => push(item.content as Buffer), { compress: false });
        }
      }
    }
  }
}

function withFileReferences(
  table: ExportTable,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const references: Record<string, FileReference | null> = {};
  for (const column of table.binary) {
    references[column] = row[column]
      ? { $file: binaryPath(table.name, table.primaryKey, column, row) }
      : null;
  }
  return { ...row, ...references };
}

/** The rows of a query a batch at a time, so a large table is never in memory whole. */
async function* cursor<T extends Record<string, unknown>>(
  tx: Transaction,
  select: SQL,
  size: number,
): AsyncGenerator<T[]> {
  await tx.execute(sql`DECLARE export_rows NO SCROLL CURSOR FOR ${select}`);
  try {
    for (;;) {
      const { rows } = await tx.execute<T>(sql`FETCH ${sql.raw(String(size))} FROM export_rows`);
      if (!rows.length) {
        return;
      }
      yield rows as T[];
    }
  } finally {
    // After a failed query the transaction is over and takes the cursor with it.
    await tx.execute(sql`CLOSE export_rows`).catch(() => undefined);
  }
}
