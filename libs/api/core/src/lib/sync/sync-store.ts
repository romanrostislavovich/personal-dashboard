import { Inject, Injectable, Logger } from '@nestjs/common';
import { SyncChange, SyncPushResponse } from '@pd/contracts';
import { sql, SQL } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { readSyncTables, SyncTable } from './sync-catalog';
import { APPLYING_SETTING, installSyncTriggers, pkObject } from './sync-triggers';

/** Rows of the change log looked at per batch. */
const SCAN_LIMIT = 1_000;
/** Fewer changes of one table than this go one at a time: bulk statements would not pay off. */
const BULK_MIN = 3;
/** Rows of one table read with one query. */
const READ_CHUNK = 500;
/** A batch stops growing after this much row data (diary photos are up to 10 MB each). */
const MAX_BATCH_BYTES = 8 * 1024 * 1024;
/** Parked changes may wait for each other (a transaction for a parked project). */
const PARKED_RETRY_PASSES = 5;

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Outcome = keyof SyncPushResponse;

/** Who sent the changes being applied, and what counts as not sent yet here. */
interface ApplyContext {
  origin: string;
  /**
   * Client only: the push cursor. A local change after it has not reached the server yet, so a
   * newer server change overwriting it is a conflict and the local version is kept. (The client
   * pulls before it pushes, so the other direction is covered by the "skipped" case.)
   */
  unsentAfter?: string | null;
}

/** A version of a row that lost a conflict; kept in `sync.conflicts`. */
interface Loser {
  table: SyncTable;
  pk: string;
  /** The row as JSON. */
  row: string;
  reason: string;
  /** Skip if the row currently in the table is exactly this one. */
  onlyIfDifferent?: boolean;
}

const LOST_TO_NEWER = 'lost to a newer row';

/** An entry of the change log as read for a batch. */
type Version = {
  table_name: string;
  pk: string;
  changed_at: string;
  tx_text: string;
  seq_text: string;
  origin: string | null;
};

/** Consecutive log entries of one table, whose rows are read with one query. */
interface ReadChunk {
  table: SyncTable | undefined;
  versions: Version[];
}

export interface ChangeBatch {
  changes: SyncChange[];
  /** Where the next batch starts; `null` — the log is empty. */
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Reads and applies row changes for sync (see docs/sync.md). Conflicts: the newer change wins;
 * the losing version is kept in `sync.conflicts`. Works with any table through the catalog.
 */
@Injectable()
export class SyncStore {
  private readonly logger = new Logger(SyncStore.name);
  private tables: SyncTable[] = [];

  constructor(@Inject(DB) private readonly db: Database) {}

  /** Reads the synced tables and installs change tracking on them. */
  async init(): Promise<void> {
    this.tables = await readSyncTables(this.db);
    const installed = await installSyncTriggers(this.db, this.tables);
    if (installed.length) {
      this.logger.log(`Change tracking installed on: ${installed.join(', ')}`);
    }
  }

  /**
   * Changes after the cursor, in commit order. `include` filters by origin (`null` — made here).
   * Only committed transactions are read: a change still in flight would otherwise be skipped
   * by a cursor that has moved past it.
   */
  changesSince(cursor: string | null, include: (origin: string | null) => boolean) {
    const [tx, seq] = parseCursor(cursor);
    return this.db.transaction(
      async (db): Promise<ChangeBatch> => {
        // Ordered by the columns themselves: ordering by the text copies (`tx_text`) would put
        // "1000" before "19", and a batch cut in the middle would skip rows for good.
        const { rows } = await db.execute<Version>(sql`
          SELECT v.table_name, v.pk::text AS pk, v.changed_at::text AS changed_at,
            v.tx::text AS tx_text, v.seq::text AS seq_text, v.origin
          FROM sync.row_versions v
          WHERE (v.tx, v.seq) > (${tx}::xid8, ${seq}::bigint)
            AND v.tx < pg_snapshot_xmin(pg_current_snapshot())
          ORDER BY v.tx, v.seq
          LIMIT ${SCAN_LIMIT}
        `);
        const changes: SyncChange[] = [];
        let next = cursor;
        let bytes = 0;
        for (const chunk of readChunks(rows, (version) => this.table(version.table_name))) {
          const data = await this.readRows(db, chunk, include);
          for (const version of chunk.versions) {
            if (bytes >= MAX_BATCH_BYTES) {
              return { changes, cursor: next, hasMore: true };
            }
            next = `${version.tx_text}:${version.seq_text}`;
            if (!chunk.table || !include(version.origin)) {
              continue;
            }
            const row = data.get(version.pk) ?? null;
            changes.push({
              table: chunk.table.name,
              pk: version.pk,
              changedAt: version.changed_at,
              row,
            });
            bytes += (row?.length ?? 0) + version.pk.length;
          }
        }
        return { changes, cursor: next, hasMore: rows.length === SCAN_LIMIT };
      },
      // One snapshot: rows are read as of the moment the change log was read.
      { isolationLevel: 'repeatable read' },
    );
  }

  /**
   * Applies changes from the other side (see ApplyContext). Changes of one table go in bulk —
   * a few statements for the whole run; the ones that need care (a local version, a clash on a
   * unique key, an error) go one at a time with the full conflict rules.
   */
  async apply(changes: SyncChange[], context: ApplyContext): Promise<SyncPushResponse> {
    const result: SyncPushResponse = { applied: 0, skipped: 0, parked: 0 };
    await this.db.transaction(async (tx) => {
      // Our trigger ignores this transaction: applied changes are logged below with their origin.
      await tx.execute(sql`SELECT set_config(${APPLYING_SETTING}, 'on', true)`);
      for (const run of writeRuns(this.dependencyOrder(changes))) {
        const table = this.table(run[0].table);
        const { applied, rest } =
          table && run.length >= BULK_MIN
            ? await this.applyInBulk(tx, table, run, context)
            : { applied: 0, rest: run };
        result.applied += applied;
        for (const change of rest) {
          result[await this.applyOrPark(tx, change, context)]++;
        }
      }
      await this.retryParked(tx, context);
    });
    return result;
  }

  /**
   * One run of upserts or deletes of one table. Returns how many were applied and the changes
   * left for the one-at-a-time path.
   */
  private async applyInBulk(
    tx: Transaction,
    table: SyncTable,
    run: SyncChange[],
    context: ApplyContext,
  ): Promise<{ applied: number; rest: SyncChange[] }> {
    const careful = new Set([
      ...(await this.withLocalVersion(tx, table, run, context)),
      ...(run[0].row !== null ? await this.withUniqueClash(tx, table, run) : []),
    ]);
    const plain = run.filter((_, index) => !careful.has(index));
    const rest = run.filter((_, index) => careful.has(index));
    if (plain.length === 0) {
      return { applied: 0, rest };
    }
    try {
      // A savepoint: if the bulk write fails (a missing parent row…), nothing of it stays and the
      // same changes go one at a time, where the failing ones are parked.
      await tx.transaction((savepoint) => this.writeInBulk(savepoint, table, plain, context));
      return { applied: plain.length, rest };
    } catch {
      return { applied: 0, rest: [...rest, ...plain] };
    }
  }

  /**
   * Positions (0-based) of the changes with a local version that matters: newer than the
   * incoming one, or not sent yet (see ApplyContext.unsentAfter).
   */
  private async withLocalVersion(
    tx: Transaction,
    table: SyncTable,
    run: SyncChange[],
    { unsentAfter }: ApplyContext,
  ): Promise<number[]> {
    const [unsentTx, unsentSeq] = parseCursor(unsentAfter ?? null);
    const { rows } = await tx.execute<{ i: number }>(sql`
      SELECT (e.i - 1)::int AS i
      FROM jsonb_array_elements(${versionsJson(run)}::jsonb) WITH ORDINALITY AS e(value, i)
      JOIN sync.row_versions v ON v.table_name = ${table.name} AND v.pk = e.value -> 'pk'
      WHERE v.changed_at >= (e.value ->> 'at')::timestamptz
        OR (${unsentAfter !== undefined} AND v.origin IS NULL
          AND (v.tx, v.seq) > (${unsentTx}::xid8, ${unsentSeq}::bigint))
    `);
    return rows.map((row) => row.i);
  }

  /** Positions of the incoming rows whose unique values another local row already holds. */
  private async withUniqueClash(
    tx: Transaction,
    table: SyncTable,
    run: SyncChange[],
  ): Promise<number[]> {
    const name = sql.identifier(table.name);
    const clashes: number[] = [];
    for (const unique of table.uniques) {
      const { rows } = await tx.execute<{ i: number }>(sql`
        SELECT DISTINCT (e.i - 1)::int AS i
        FROM jsonb_array_elements(${jsonArray(run.map((c) => c.row ?? '{}'))}::jsonb)
          WITH ORDINALITY AS e(value, i)
        CROSS JOIN LATERAL jsonb_populate_record(NULL::${name}, e.value) k
        JOIN ${name} t ON (${columns('t', unique)}) = (${columns('k', unique)})
          AND (${columns('t', table.primaryKey)}) <> (${columns('k', table.primaryKey)})
      `);
      clashes.push(...rows.map((row) => row.i));
    }
    return clashes;
  }

  /** Writes the rows and logs their versions: three statements for the whole run. */
  private async writeInBulk(
    tx: Transaction,
    table: SyncTable,
    run: SyncChange[],
    { origin }: ApplyContext,
  ): Promise<void> {
    const name = sql.identifier(table.name);
    if (run[0].row !== null) {
      const updates = table.columns
        .filter((column) => !table.primaryKey.includes(column))
        .map((column) => sql`${sql.identifier(column)} = EXCLUDED.${sql.identifier(column)}`);
      const rows = jsonArray(run.map((change) => change.row ?? '{}'));
      await tx.execute(sql`
        INSERT INTO ${name} SELECT * FROM jsonb_populate_recordset(NULL::${name}, ${rows}::jsonb)
        ON CONFLICT (${columns(null, table.primaryKey)})
        ${updates.length ? sql`DO UPDATE SET ${sql.join(updates, sql`, `)}` : sql`DO NOTHING`}
      `);
    } else {
      await tx.execute(sql`
        DELETE FROM ${name} t WHERE (${columns('t', table.primaryKey)}) IN (
          SELECT ${columns('k', table.primaryKey)}
          FROM jsonb_populate_recordset(NULL::${name}, ${jsonArray(run.map((c) => c.pk))}::jsonb) k
        )
      `);
    }
    const versions = versionsJson(run);
    await tx.execute(sql`
      INSERT INTO sync.row_versions (table_name, pk, changed_at, tx, seq, origin)
      SELECT ${table.name}, e.value -> 'pk', (e.value ->> 'at')::timestamptz,
        pg_current_xact_id(), nextval('sync.change_seq'), ${origin}
      FROM jsonb_array_elements(${versions}::jsonb) WITH ORDINALITY AS e(value, i)
      ORDER BY e.i
      ON CONFLICT (table_name, pk) DO UPDATE
        SET changed_at = EXCLUDED.changed_at, tx = EXCLUDED.tx, seq = EXCLUDED.seq,
          origin = EXCLUDED.origin
    `);
    // Older parked versions of these rows are obsolete now.
    await tx.execute(sql`
      DELETE FROM sync.parked p USING jsonb_array_elements(${versions}::jsonb) AS e(value)
      WHERE p.table_name = ${table.name} AND p.pk = e.value -> 'pk'
        AND p.changed_at <= (e.value ->> 'at')::timestamptz
    `);
  }

  /** Local changes not sent yet (client). */
  async pendingCount(cursor: string | null): Promise<number> {
    const [tx, seq] = parseCursor(cursor);
    const { rows } = await this.db.execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM sync.row_versions
      WHERE origin IS NULL AND (tx, seq) > (${tx}::xid8, ${seq}::bigint)
    `);
    return rows[0]?.count ?? 0;
  }

  async problemCounts(): Promise<{ parked: number; conflicts: number }> {
    const { rows } = await this.db.execute<{ parked: number; conflicts: number }>(sql`
      SELECT (SELECT count(*)::int FROM sync.parked) AS parked,
        (SELECT count(*)::int FROM sync.conflicts) AS conflicts
    `);
    return rows[0] ?? { parked: 0, conflicts: 0 };
  }

  private async applyOrPark(
    tx: Transaction,
    change: SyncChange,
    context: ApplyContext,
  ): Promise<Outcome> {
    try {
      // A savepoint: a failed change is rolled back alone, the rest of the batch goes on.
      return await tx.transaction((savepoint) => this.applyChange(savepoint, change, context));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Parked ${change.table} ${change.pk}: ${message}`);
      await tx.execute(sql`
        INSERT INTO sync.parked (table_name, pk, changed_at, row, origin, error)
        VALUES (${change.table}, ${change.pk}::jsonb, ${change.changedAt}::timestamptz,
          ${change.row}::jsonb, ${context.origin}, ${message})
        ON CONFLICT (table_name, pk) DO UPDATE
          SET changed_at = EXCLUDED.changed_at, row = EXCLUDED.row, origin = EXCLUDED.origin,
            error = EXCLUDED.error, parked_at = now()
          WHERE sync.parked.changed_at <= EXCLUDED.changed_at
      `);
      return 'parked';
    }
  }

  private async applyChange(
    tx: Transaction,
    change: SyncChange,
    { origin, unsentAfter }: ApplyContext,
  ): Promise<Outcome> {
    const table = this.table(change.table);
    if (!table) {
      throw new Error(`Unknown table ${change.table} — are both instances on the same version?`);
    }
    const local = await this.localVersion(tx, table, change, unsentAfter);
    if (local?.localWins) {
      if (change.row !== null) {
        const loser = { table, pk: change.pk, row: change.row, onlyIfDifferent: true };
        await this.keepLoser(tx, { ...loser, reason: 'older than the local version' });
      }
      return 'skipped';
    }
    if (local?.unsent) {
      await this.keepOverwrittenLocal(tx, table, change);
    }
    if (!(await this.writeRow(tx, table, change))) {
      return 'skipped';
    }
    await this.recordVersion(tx, table, change, origin);
    return 'applied';
  }

  /**
   * How the incoming change relates to the local version of the row: the local one is newer
   * (`localWins`), or it was changed here and not sent yet (`unsent`). Nothing — no local version.
   */
  private async localVersion(
    tx: Transaction,
    table: SyncTable,
    change: SyncChange,
    unsentAfter: ApplyContext['unsentAfter'],
  ): Promise<{ localWins: boolean; unsent: boolean } | undefined> {
    const [unsentTx, unsentSeq] = parseCursor(unsentAfter ?? null);
    const localRow = sql`(SELECT to_jsonb(t)::text FROM ${sql.identifier(table.name)} t
      WHERE ${pkMatch(table, change.pk)})`;
    const { rows } = await tx.execute<{ local_wins: boolean; unsent: boolean }>(sql`
      SELECT ${winsOver(sql`changed_at`, localRow, change)} AS local_wins,
        ${unsentAfter !== undefined} AND origin IS NULL
          AND (tx, seq) > (${unsentTx}::xid8, ${unsentSeq}::bigint) AS unsent
      FROM sync.row_versions WHERE table_name = ${table.name} AND pk = ${change.pk}::jsonb
    `);
    return rows[0] && { localWins: rows[0].local_wins, unsent: rows[0].unsent };
  }

  /** A newer change overwrites a local one that never reached the other side — keep the local. */
  private async keepOverwrittenLocal(
    tx: Transaction,
    table: SyncTable,
    change: SyncChange,
  ): Promise<void> {
    const local = await this.readRow(tx, table, change.pk);
    if (local !== null && local !== change.row) {
      const reason = 'overwritten by a newer change';
      await this.keepLoser(tx, { table, pk: change.pk, row: local, reason });
    }
  }

  /** Deletes or upserts the row; false if the upsert lost to a newer row (see `upsert`). */
  private async writeRow(tx: Transaction, table: SyncTable, change: SyncChange): Promise<boolean> {
    if (change.row !== null) {
      return this.upsert(tx, table, change);
    }
    await tx.execute(
      sql`DELETE FROM ${sql.identifier(table.name)} t WHERE ${pkMatch(table, change.pk)}`,
    );
    return true;
  }

  /** Logs the applied change with its origin, so it is not sent back where it came from. */
  private async recordVersion(
    tx: Transaction,
    table: SyncTable,
    change: SyncChange,
    origin: string,
  ): Promise<void> {
    await tx.execute(sql`
      INSERT INTO sync.row_versions (table_name, pk, changed_at, tx, seq, origin)
      VALUES (${table.name}, ${change.pk}::jsonb, ${change.changedAt}::timestamptz,
        pg_current_xact_id(), nextval('sync.change_seq'), ${origin})
      ON CONFLICT (table_name, pk) DO UPDATE
        SET changed_at = EXCLUDED.changed_at, tx = EXCLUDED.tx, seq = EXCLUDED.seq,
          origin = EXCLUDED.origin
    `);
    // An older parked version of the same row is obsolete now.
    await tx.execute(sql`
      DELETE FROM sync.parked WHERE table_name = ${table.name} AND pk = ${change.pk}::jsonb
        AND changed_at <= ${change.changedAt}::timestamptz
    `);
  }

  /**
   * Inserts or updates the row. Another row may hold the same unique values under a different
   * id (a diary entry for the same day written on both sides): the newer one stays.
   * Returns false if the local row is newer and the incoming one was not applied.
   */
  private async upsert(tx: Transaction, table: SyncTable, change: SyncChange): Promise<boolean> {
    const name = sql.identifier(table.name);
    for (const unique of table.uniques) {
      const { rows } = await tx.execute<{ pk: string; row: string; local_wins: boolean | null }>(
        sql`
          SELECT ${pkObject(table, sql`to_jsonb(t)`)}::text AS pk, to_jsonb(t)::text AS row,
            ${winsOver(sql`v.changed_at`, sql`to_jsonb(t)::text`, change)} AS local_wins
          FROM ${name} t
          CROSS JOIN jsonb_populate_record(NULL::${name}, ${change.row}::jsonb) k
          LEFT JOIN sync.row_versions v
            ON v.table_name = ${table.name} AND v.pk = ${pkObject(table, sql`to_jsonb(t)`)}
          WHERE (${columns('t', unique)}) = (${columns('k', unique)})
            AND (${columns('t', table.primaryKey)}) <> (${columns('k', table.primaryKey)})
        `,
      );
      for (const local of rows) {
        if (table.name === 'users') {
          // Deleting a user deletes all their data — never do that automatically.
          throw new Error(
            'Another user with the same email exists on this side. Start the second instance ' +
              'with an empty database (see docs/sync.md).',
          );
        }
        if (local.local_wins) {
          const loser = { table, pk: change.pk, row: change.row ?? '{}', reason: LOST_TO_NEWER };
          await this.keepLoser(tx, loser);
          return false;
        }
        await this.keepLoser(tx, { table, pk: local.pk, row: local.row, reason: LOST_TO_NEWER });
        await tx.execute(sql`DELETE FROM ${name} t WHERE ${pkMatch(table, local.pk)}`);
      }
    }
    const updates = table.columns
      .filter((column) => !table.primaryKey.includes(column))
      .map((column) => sql`${sql.identifier(column)} = EXCLUDED.${sql.identifier(column)}`);
    await tx.execute(sql`
      INSERT INTO ${name} SELECT * FROM jsonb_populate_record(NULL::${name}, ${change.row}::jsonb)
      ON CONFLICT (${columns(null, table.primaryKey)})
      ${updates.length ? sql`DO UPDATE SET ${sql.join(updates, sql`, `)}` : sql`DO NOTHING`}
    `);
    return true;
  }

  /** Saves the losing version of a row (unless it equals the current one). */
  private async keepLoser(
    tx: Transaction,
    { table, pk, row, reason, onlyIfDifferent = false }: Loser,
  ): Promise<void> {
    const differs = onlyIfDifferent
      ? sql`AND NOT EXISTS (SELECT 1 FROM ${sql.identifier(table.name)} t
          WHERE ${pkMatch(table, pk)} AND to_jsonb(t) = ${row}::jsonb)`
      : sql``;
    await tx.execute(sql`
      INSERT INTO sync.conflicts (table_name, pk, row, reason)
      SELECT ${table.name}, ${pk}::jsonb, ${row}::jsonb, ${reason} WHERE true ${differs}
    `);
  }

  private async retryParked(tx: Transaction, context: ApplyContext): Promise<void> {
    for (let pass = 0; pass < PARKED_RETRY_PASSES; pass++) {
      const { rows } = await tx.execute<{
        table_name: string;
        pk: string;
        changed_at: string;
        row: string | null;
        origin: string;
      }>(sql`
        SELECT table_name, pk::text AS pk, changed_at::text AS changed_at, row::text AS row, origin
        FROM sync.parked
      `);
      let progress = false;
      const changes = rows.map((row) => ({
        change: { table: row.table_name, pk: row.pk, changedAt: row.changed_at, row: row.row },
        origin: row.origin,
      }));
      for (const { change, origin } of this.dependencyOrder(changes, (item) => item.change)) {
        try {
          await tx.transaction((savepoint) =>
            this.applyChange(savepoint, change, { ...context, origin }),
          );
          await tx.execute(sql`
            DELETE FROM sync.parked WHERE table_name = ${change.table} AND pk = ${change.pk}::jsonb
          `);
          progress = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await tx.execute(sql`
            UPDATE sync.parked SET error = ${message}
            WHERE table_name = ${change.table} AND pk = ${change.pk}::jsonb
          `);
        }
      }
      if (!progress) {
        return;
      }
    }
  }

  /** The rows of a chunk that are sent, by primary key; a deleted row is simply missing. */
  private async readRows(
    tx: Transaction,
    { table, versions }: ReadChunk,
    include: (origin: string | null) => boolean,
  ): Promise<Map<string, string>> {
    const pks = versions.filter((version) => include(version.origin)).map((v) => v.pk);
    if (!table || pks.length === 0) {
      return new Map();
    }
    const name = sql.identifier(table.name);
    const { rows } = await tx.execute<{ pk: string; row: string }>(sql`
      SELECT ${pkObject(table, sql`to_jsonb(t)`)}::text AS pk, to_jsonb(t)::text AS row
      FROM ${name} t
      WHERE (${columns('t', table.primaryKey)}) IN (
        SELECT ${columns('k', table.primaryKey)}
        FROM jsonb_populate_recordset(NULL::${name}, ${jsonArray(pks)}::jsonb) k
      )
    `);
    return new Map(rows.map((row) => [row.pk, row.row]));
  }

  private async readRow(tx: Transaction, table: SyncTable, pk: string): Promise<string | null> {
    const { rows } = await tx.execute<{ row: string }>(sql`
      SELECT to_jsonb(t)::text AS row FROM ${sql.identifier(table.name)} t
      WHERE ${pkMatch(table, pk)}
    `);
    return rows[0]?.row ?? null;
  }

  /** Inserts and updates parents first, then deletes children first — foreign keys stay valid. */
  private dependencyOrder<T>(
    items: T[],
    changeOf: (item: T) => SyncChange = (item) => item as SyncChange,
  ): T[] {
    const position = new Map(this.tables.map((table, index) => [table.name, index]));
    const rank = (item: T) => position.get(changeOf(item).table) ?? 0;
    const upserts = items.filter((item) => changeOf(item).row !== null);
    const deletes = items.filter((item) => changeOf(item).row === null);
    return [
      ...upserts.sort((a, b) => rank(a) - rank(b)),
      ...deletes.sort((a, b) => rank(b) - rank(a)),
    ];
  }

  private table(name: string): SyncTable | undefined {
    return this.tables.find((table) => table.name === name);
  }
}

/**
 * Splits the log into runs of one table (up to READ_CHUNK) for bulk reads. Rows with binary data
 * (photos, up to 10 MB each) are read one at a time so the batch size limit is checked between them.
 */
function readChunks(
  versions: Version[],
  tableOf: (version: Version) => SyncTable | undefined,
): ReadChunk[] {
  const chunks: ReadChunk[] = [];
  for (const version of versions) {
    const table = tableOf(version);
    const last = chunks.at(-1);
    const joins =
      last && last.table === table && !table?.large && last.versions.length < READ_CHUNK;
    if (joins) {
      last.versions.push(version);
    } else {
      chunks.push({ table, versions: [version] });
    }
  }
  return chunks;
}

/**
 * Splits changes (in dependency order) into runs of one table and one kind — upserts or
 * deletes — for bulk writes. A row changed twice starts a new run: one statement cannot write
 * the same row twice.
 */
function writeRuns(changes: SyncChange[]): SyncChange[][] {
  const runs: SyncChange[][] = [];
  let pks = new Set<string>();
  for (const change of changes) {
    const run = runs.at(-1);
    const joins =
      run &&
      run[0].table === change.table &&
      (run[0].row === null) === (change.row === null) &&
      !pks.has(change.pk);
    if (joins) {
      run.push(change);
    } else {
      runs.push([change]);
      pks = new Set();
    }
    pks.add(change.pk);
  }
  return runs;
}

/** `[{"pk": {…}, "at": "…"}, …]` — the primary keys and change times of a run. */
function versionsJson(run: SyncChange[]): string {
  return jsonArray(run.map((c) => `{"pk":${c.pk},"at":${JSON.stringify(c.changedAt)}}`));
}

/** A JSON array of values that are JSON already (rows, primary keys). */
function jsonArray(items: string[]): string {
  return `[${items.join(',')}]`;
}

/** Cursor `tx:seq` — a position in the change log. */
function parseCursor(cursor: string | null): [string, string] {
  const [tx, seq] = (cursor ?? '0:0').split(':');
  return [tx, seq];
}

/**
 * Whether the local version beats the incoming change: it is newer, or — changed at the same
 * moment — its row sorts after the incoming one as JSON text. Both sides compare the same pair,
 * so they keep the same version (rows that existed before sync all date from the epoch; without
 * this each side would keep its own for good). A missing row (deleted) sorts first.
 */
function winsOver(localChangedAt: SQL, localRow: SQL, change: SyncChange): SQL {
  const incoming = sql`${change.changedAt}::timestamptz`;
  const incomingRow = sql`coalesce(${change.row}::jsonb::text, '')`;
  return sql`(${localChangedAt} > ${incoming}
    OR (${localChangedAt} = ${incoming} AND coalesce(${localRow}, '') >= ${incomingRow}))`;
}

/** `t.a, t.b` (or `a, b` without an alias). */
function columns(alias: string | null, names: string[]): SQL {
  return sql.join(
    names.map((name) =>
      alias ? sql`${sql.raw(alias)}.${sql.identifier(name)}` : sql.identifier(name),
    ),
    sql`, `,
  );
}

/** The row of `t` with the primary key given as JSON. */
function pkMatch(table: SyncTable, pk: string): SQL {
  const name = sql.identifier(table.name);
  return sql`(${columns('t', table.primaryKey)}) = (SELECT ${columns('k', table.primaryKey)}
    FROM jsonb_populate_record(NULL::${name}, ${pk}::jsonb) k)`;
}
