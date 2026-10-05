import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  DATA_ARCHIVE_FORMAT,
  DataArchiveManifest,
  DataImportReport,
  DataImportTable,
} from '@pd/contracts';
import { sql, SQL } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { DB, Database } from '../database/database.module';
import { isFileReference, MANIFEST_PATH, readArchive, tableOfPath } from './data-archive';
import {
  exportable,
  ExportTable,
  ownedBy,
  Ownership,
  readExportTables,
  USER_COLUMN,
} from './export-catalog';

/** Rows written with one query; rows with photos — a few, they are large. */
const ROWS_AT_A_TIME = 1000;
const BINARY_ROWS_AT_A_TIME = 10;
/** An uploaded archive waits this long for "Import" to be pressed. */
const KEPT_MS = 60 * 60 * 1000;

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Row = Record<string, unknown>;

interface Target {
  table: ExportTable;
  owned: Ownership;
}

interface Upload {
  userId: string;
  path: string;
  expiresAt: number;
}

/** Ends the transaction of a preview: everything it wrote is taken back. */
class Preview extends Error {}

/**
 * Brings an archive of DataExportService into the signed-in account — the same one on another
 * instance, an empty one, or the one it was made from. Only what is missing is added: a row that
 * is already here (the same key, or the same unique value) stays as it is, nothing is deleted.
 *
 * An archive is a file from outside, so nothing in it is trusted: only tables an export writes
 * are read, every row becomes the importing user's own, and a row is taken only if what it
 * references is that user's too.
 */
@Injectable()
export class DataImportService implements OnApplicationShutdown {
  private readonly uploads = new Map<string, Upload>();

  constructor(@Inject(DB) private readonly db: Database) {}

  /** What the uploaded archive would add; it is kept for `apply`. Nothing is changed. */
  async preview(userId: string, path: string): Promise<DataImportReport> {
    await this.forgetExpired();
    const id = randomUUID();
    try {
      const report = await this.run(userId, id, path, false);
      this.uploads.set(id, { userId, path, expiresAt: Date.now() + KEPT_MS });
      return report;
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
  }

  /** Adds what the archive of a preview has and the dashboard does not. */
  async apply(userId: string, id: string): Promise<DataImportReport> {
    const upload = this.take(userId, id);
    try {
      return await this.run(userId, id, upload.path, true);
    } finally {
      await this.discard(userId, id);
    }
  }

  async discard(userId: string, id: string): Promise<void> {
    const upload = this.uploads.get(id);
    if (upload?.userId === userId) {
      this.uploads.delete(id);
      await rm(upload.path, { force: true });
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([...this.uploads.values()].map(({ path }) => rm(path, { force: true })));
  }

  private take(userId: string, id: string): Upload {
    const upload = this.uploads.get(id);
    if (!upload || upload.userId !== userId || upload.expiresAt < Date.now()) {
      throw new NotFoundException('The uploaded archive is gone: upload it again');
    }
    return upload;
  }

  private async forgetExpired(): Promise<void> {
    for (const [id, upload] of this.uploads) {
      if (upload.expiresAt < Date.now()) {
        await this.discard(upload.userId, id);
      }
    }
  }

  /** One pass over the archive in one transaction; a preview rolls it back at the end. */
  private async run(
    userId: string,
    id: string,
    path: string,
    commit: boolean,
  ): Promise<DataImportReport> {
    let report: DataImportReport | null = null;
    try {
      await this.db.transaction(async (tx) => {
        report = { id, ...(await this.read(tx, userId, path)) };
        if (!commit) {
          throw new Preview();
        }
      });
    } catch (error) {
      if (!(error instanceof Preview)) {
        throw error;
      }
    }
    return report as unknown as DataImportReport;
  }

  private async read(
    tx: Transaction,
    userId: string,
    path: string,
  ): Promise<Omit<DataImportReport, 'id'>> {
    const targets = new Map(
      exportable(await readExportTables(tx)).map((target) => [target.table.name, target]),
    );
    let manifest: DataArchiveManifest | null = null;
    const counts = new Map<string, DataImportTable>();
    const unknown = new Set<string>();
    /** Rows of the table being read that wait to be written. */
    let batch: { target: Target; rows: Row[] } | null = null;
    /** Rows that wait for their binary files, by the path of each file. */
    const waiting = new Map<string, { target: Target; row: Row; column: string }>();

    const flush = async () => {
      if (batch?.rows.length) {
        const added = await this.insert(tx, userId, batch.target, targets, batch.rows);
        (counts.get(batch.target.table.name) as DataImportTable).added += added;
        batch.rows = [];
      }
    };
    const add = async (target: Target, row: Row) => {
      if (batch?.target !== target) {
        await flush();
        batch = { target, rows: [] };
      }
      batch.rows.push(row);
      const limit = target.table.binary.length ? BINARY_ROWS_AT_A_TIME : ROWS_AT_A_TIME;
      if (batch.rows.length >= limit) {
        await flush();
      }
    };

    for await (const event of readArchive(path)) {
      if (event.kind === 'file' && event.path === MANIFEST_PATH) {
        manifest = parseManifest(event.content);
        continue;
      }
      if (!manifest) {
        throw new BadRequestException('Not an archive of a dashboard: it has no manifest');
      }
      if (event.kind === 'file') {
        const pending = waiting.get(event.path);
        if (pending) {
          waiting.delete(event.path);
          // PostgreSQL reads `\x…` as the bytes of a bytea column.
          pending.row[pending.column] = `\\x${event.content.toString('hex')}`;
          if (!Object.values(pending.row).some(isFileReference)) {
            await add(pending.target, pending.row);
          }
        }
        continue;
      }
      const name = tableOfPath(event.path) as string;
      const target = targets.get(name);
      if (!target) {
        unknown.add(name);
        continue;
      }
      const row = parseRow(event.line);
      const count = counts.get(name) ?? { table: name, inArchive: 0, added: 0 };
      counts.set(name, { ...count, inArchive: count.inArchive + 1 });
      const files = Object.entries(row).filter(([, value]) => isFileReference(value));
      if (!files.length) {
        await add(target, row);
      }
      for (const [column, reference] of files) {
        waiting.set((reference as { $file: string }).$file, { target, row, column });
      }
    }
    await flush();
    if (!manifest) {
      throw new BadRequestException('Not an archive of a dashboard: it has no manifest');
    }
    return {
      exportedAt: (manifest as DataArchiveManifest).exportedAt,
      tables: [...counts.values()],
      unknownTables: [...unknown].sort(),
    };
  }

  /** Writes the rows that are not here yet and returns how many that was. */
  private async insert(
    tx: Transaction,
    userId: string,
    { table, owned }: Target,
    targets: ReadonlyMap<string, Target>,
    rows: Row[],
  ): Promise<number> {
    const name = sql.identifier(table.name);
    const direct = owned.kind === 'direct';
    // Whoever the archive was exported by, its rows become the importing user's.
    const record = direct
      ? sql`e.value || jsonb_build_object(${USER_COLUMN}::text, ${userId}::uuid)`
      : sql`e.value`;
    const incoming = sql`jsonb_array_elements(${JSON.stringify(rows)}::jsonb) e
      CROSS JOIN LATERAL jsonb_populate_record(NULL::${name}, ${record}) k`;

    // The same key in another account (the archive imported into two accounts of one
    // instance): adding "what is missing" would tie this user's rows to someone else's.
    if (direct && !table.primaryKey.includes(USER_COLUMN)) {
      const sameKey = sql.join(
        table.primaryKey.map((key) => sql`t.${sql.identifier(key)} = k.${sql.identifier(key)}`),
        sql` AND `,
      );
      const { rows: taken } = await tx.execute(sql`
        SELECT 1 FROM ${incoming} JOIN ${name} t ON ${sameKey}
        WHERE t.${sql.identifier(USER_COLUMN)} <> ${userId} LIMIT 1`);
      if (taken.length) {
        throw new ConflictException(
          'This archive is already imported into another account of this dashboard',
        );
      }
    }

    // Columns the archive does not know (added since the export) take their defaults.
    const known = new Set([...Object.keys(rows[0]), ...(direct ? [USER_COLUMN] : [])]);
    const columns = sql.join(
      table.columns.filter((column) => known.has(column)).map((column) => sql.identifier(column)),
      sql`, `,
    );
    // A row is taken only with what it references being this user's too (or not there at all:
    // then the row is left out instead of breaking the import).
    const references: SQL[] = table.references.flatMap((reference) => {
      const parent = targets.get(reference.table);
      if (!parent) {
        return [];
      }
      const column = sql`k.${sql.identifier(reference.column)}`;
      return [
        sql`AND (${column} IS NULL OR EXISTS (
          SELECT 1 FROM ${sql.identifier(reference.table)} p
          WHERE p.${sql.identifier(reference.target)} = ${column}
            AND ${ownedBy(parent.owned, 'p', userId)}))`,
      ];
    });
    const result = await tx.execute(sql`
      INSERT INTO ${name} (${columns})
      SELECT ${columns} FROM ${incoming} WHERE true ${sql.join(references, sql` `)}
      ON CONFLICT DO NOTHING`);
    return result.rowCount ?? 0;
  }
}

function parseManifest(content: Buffer): DataArchiveManifest {
  let manifest: DataArchiveManifest;
  try {
    manifest = JSON.parse(content.toString('utf8')) as DataArchiveManifest;
  } catch {
    throw new BadRequestException('Not an archive of a dashboard: the manifest is not readable');
  }
  if (typeof manifest.format !== 'number' || manifest.format > DATA_ARCHIVE_FORMAT) {
    throw new BadRequestException('The archive is made by a newer version of the dashboard');
  }
  return manifest;
}

function parseRow(line: string): Row {
  try {
    const row: unknown = JSON.parse(line);
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      return row as Row;
    }
  } catch {
    // Reported below.
  }
  throw new BadRequestException('The archive is damaged: a line of a table is not a record');
}
