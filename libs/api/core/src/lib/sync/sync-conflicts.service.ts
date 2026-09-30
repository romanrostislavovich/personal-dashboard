import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SyncConflict, SyncParkedChange, SyncParkedKey } from '@pd/contracts';
import { sql, SQL } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { isForeignKeyViolation } from '../database/pg-errors';
import { UsersService } from '../users/users.service';
import { readSyncTables, SyncTable } from './sync-catalog';

/** The screen shows the latest ones; older ones follow after these are sorted out. */
const LIST_LIMIT = 100;
/** Longer text (a diary entry, a photo as hex) is cut for display — never when restoring. */
const SHOWN_LENGTH = 1_000;

/**
 * What sync set aside (docs/sync.md, "Conflicts"): versions of rows that lost to a newer change,
 * and incoming changes that could not be applied. The user looks at both versions and keeps the
 * one they want; the choice is an ordinary local change and syncs to the other side.
 */
@Injectable()
export class SyncConflictsService {
  private tables: Promise<SyncTable[]> | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  async conflicts(userId: string): Promise<SyncConflict[]> {
    const { rows } = await this.db.execute<{
      id: string;
      table_name: string;
      reason: string;
      created_at: string;
      row: Record<string, unknown>;
    }>(sql`
      SELECT c.id, c.table_name, c.reason, c.created_at::text AS created_at, c.row
      FROM sync.conflicts c
      WHERE ${await this.owned(userId, sql`c.table_name`, sql`c.row`)}
      ORDER BY c.created_at DESC LIMIT ${LIST_LIMIT}
    `);
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        table: row.table_name,
        reason: row.reason,
        createdAt: new Date(row.created_at).toISOString(),
        kept: forDisplay(row.row),
        current: await this.current(row.table_name, row.id),
      })),
    );
  }

  /** Keeps the version that lost: it replaces the current row and syncs to the other side. */
  async keep(userId: string, id: string): Promise<void> {
    const conflict = await this.requireConflict(userId, id);
    const table = await this.table(conflict.table_name);
    const name = sql.identifier(table.name);
    const incoming = sql`jsonb_populate_record(NULL::${name}, ${conflict.row}::jsonb)`;
    try {
      await this.db.transaction(async (tx) => {
        // A row holding the same unique values under another key (the diary entry of the same
        // day) gives way; it lands in the trash, so nothing is lost either.
        for (const unique of table.uniques) {
          await tx.execute(sql`
            DELETE FROM ${name} t USING ${incoming} k
            WHERE (${columns('t', unique)}) = (${columns('k', unique)})
              AND (${columns('t', table.primaryKey)}) <> (${columns('k', table.primaryKey)})
          `);
        }
        const updates = table.columns
          .filter((column) => !table.primaryKey.includes(column))
          .map((column) => sql`${sql.identifier(column)} = EXCLUDED.${sql.identifier(column)}`);
        await tx.execute(sql`
          INSERT INTO ${name} SELECT * FROM ${incoming}
          ON CONFLICT (${columns(null, table.primaryKey)})
          ${updates.length ? sql`DO UPDATE SET ${sql.join(updates, sql`, `)}` : sql`DO NOTHING`}
        `);
        await tx.execute(sql`DELETE FROM sync.conflicts WHERE id = ${id}::uuid`);
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException('What this row belongs to no longer exists');
      }
      throw error;
    }
  }

  /** Leaves the current row as it is and forgets the other version. */
  async dismiss(userId: string, id: string): Promise<void> {
    await this.requireConflict(userId, id);
    await this.db.execute(sql`DELETE FROM sync.conflicts WHERE id = ${id}::uuid`);
  }

  async dismissAll(userId: string): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM sync.conflicts c WHERE ${await this.owned(userId, sql`c.table_name`, sql`c.row`)}
    `);
  }

  async parked(userId: string): Promise<SyncParkedChange[]> {
    const { rows } = await this.db.execute<{
      table_name: string;
      pk: string;
      error: string;
      parked_at: string;
      row: Record<string, unknown> | null;
    }>(sql`
      SELECT p.table_name, p.pk::text AS pk, p.error, p.parked_at::text AS parked_at, p.row
      FROM sync.parked p
      WHERE ${await this.owned(userId, sql`p.table_name`, sql`p.row`)}
      ORDER BY p.parked_at DESC LIMIT ${LIST_LIMIT}
    `);
    return rows.map((row) => ({
      table: row.table_name,
      pk: row.pk,
      error: row.error,
      parkedAt: new Date(row.parked_at).toISOString(),
      row: row.row && forDisplay(row.row),
    }));
  }

  /** Gives up on a change that keeps failing. */
  async discardParked(userId: string, key: SyncParkedKey): Promise<void> {
    const { rowCount } = await this.db.execute(sql`
      DELETE FROM sync.parked p
      WHERE p.table_name = ${key.table} AND p.pk = ${key.pk}::jsonb
        AND ${await this.owned(userId, sql`p.table_name`, sql`p.row`)}
    `);
    if (!rowCount) {
      throw new NotFoundException('No such change');
    }
  }

  /**
   * Whose a set-aside row is: its `user_id`, the user row itself, or — a row with neither (a
   * match of a game account, a deletion) — the owner of the instance.
   */
  private async owned(userId: string, table: SQL, row: SQL): Promise<SQL> {
    const isOwner = (await this.users.owner())?.id === userId;
    return sql`(${row} ->> 'user_id' = ${userId}
      OR (${table} = 'users' AND ${row} ->> 'id' = ${userId})
      OR (${isOwner} AND ${table} <> 'users'
        AND (${row} IS NULL OR NOT (${row} ? 'user_id'))))`;
  }

  private async requireConflict(
    userId: string,
    id: string,
  ): Promise<{ table_name: string; row: string }> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new NotFoundException('No such conflict');
    }
    const { rows } = await this.db.execute<{ table_name: string; row: string }>(sql`
      SELECT c.table_name, c.row::text AS row FROM sync.conflicts c
      WHERE c.id = ${id}::uuid AND ${await this.owned(userId, sql`c.table_name`, sql`c.row`)}
    `);
    if (!rows[0]) {
      throw new NotFoundException('No such conflict');
    }
    return rows[0];
  }

  /** The row the conflict is about, as it is now. */
  private async current(tableName: string, id: string): Promise<Record<string, unknown> | null> {
    const table = await this.table(tableName).catch(() => null);
    if (!table) {
      return null;
    }
    const name = sql.identifier(table.name);
    const { rows } = await this.db.execute<{ row: Record<string, unknown> }>(sql`
      SELECT to_jsonb(t) AS row FROM ${name} t
      WHERE (${columns('t', table.primaryKey)}) = (
        SELECT ${columns('k', table.primaryKey)} FROM sync.conflicts c
        CROSS JOIN LATERAL jsonb_populate_record(NULL::${name}, c.pk) k
        WHERE c.id = ${id}::uuid
      )
    `);
    return rows[0] ? forDisplay(rows[0].row) : null;
  }

  private async table(name: string): Promise<SyncTable> {
    this.tables ??= readSyncTables(this.db);
    const table = (await this.tables).find((candidate) => candidate.name === name);
    if (!table) {
      throw new NotFoundException(`Unknown table ${name}`);
    }
    return table;
  }
}

/** `t.a, t.b` — or just `a, b` without an alias. */
function columns(alias: string | null, names: string[]): SQL {
  return sql.join(
    names.map((name) =>
      alias ? sql`${sql.identifier(alias)}.${sql.identifier(name)}` : sql.identifier(name),
    ),
    sql`, `,
  );
}

/** Long values cut, a photo's bytes replaced by their size. */
export function forDisplay(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (typeof value !== 'string' || value.length <= SHOWN_LENGTH) {
        return [key, value];
      }
      if (value.startsWith('\\x')) {
        return [key, `[${Math.round((value.length - 2) / 2 / 1024)} KB]`];
      }
      return [key, `${value.slice(0, SHOWN_LENGTH)}…`];
    }),
  );
}
