import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { getTableColumns, getTableName, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { DB, Database } from '../database/database.module';
import { TrashService } from '../trash/trash.service';
import { DbRow, isEmpty, rowChanges, UndoData } from './ai-undo';

/**
 * Reads the user's rows of a tool's tables around its call, and puts them back on undo (see
 * ai-undo.ts). The tables are a person's own data — a few thousand rows at most — and a write
 * of the assistant is rare, so reading them twice costs nothing worth saving.
 */
@Injectable()
export class AiUndoService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly trash: TrashService,
  ) {}

  /** A table can be undone only when it has a `user_id`: only the user's rows are read. */
  static check(table: PgTable): void {
    if (!('userId' in getTableColumns(table))) {
      throw new Error(`${getTableName(table)} has no userId: it cannot be undone`);
    }
  }

  /** Runs the call; `undo` — the way back, `null` when it changed nothing. */
  async capture<T>(
    userId: string,
    tables: PgTable[],
    run: () => Promise<T>,
  ): Promise<{ value: T; undo: UndoData | null }> {
    const before = await Promise.all(tables.map((table) => this.rows(userId, table)));
    const {
      rows: [{ now }],
    } = await this.db.execute<{ now: string }>(sql`SELECT clock_timestamp()::text AS now`);
    const value = await run();
    const after = await Promise.all(tables.map((table) => this.rows(userId, table)));
    const { rows: deleted } = await this.db.execute<{ tx: string }>(sql`
      SELECT DISTINCT tx::text AS tx FROM trash.rows
      WHERE user_id = ${userId} AND deleted_at >= ${now}::timestamptz
    `);
    const undo: UndoData = {
      tables: tables.flatMap(
        (table, i) => rowChanges(getTableName(table), before[i], after[i]) ?? [],
      ),
      trash: deleted.map((row) => row.tx),
    };
    return { value, undo: isEmpty(undo) ? null : undo };
  }

  /**
   * Puts things back as they were before the call. Refuses when a row was changed again since
   * (by the person, or by sync): the undo would overwrite that change.
   */
  async undo(userId: string, undo: UndoData): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const change of undo.tables) {
        const name = sql.identifier(change.table);
        const now = [...change.inserted, ...change.updated.map((one) => one.after)];
        for (const row of now) {
          const {
            rows: [current],
          } = await tx.execute<{ same: boolean | null }>(sql`
            SELECT to_jsonb(t) = ${JSON.stringify(row)}::jsonb AS same
            FROM ${name} t WHERE t.id = ${row.id} AND t.user_id = ${userId}
          `);
          if (current && !current.same) {
            throw new ConflictException('Changed since: undoing it would overwrite that change');
          }
        }
        for (const row of change.inserted) {
          await tx.execute(sql`DELETE FROM ${name} WHERE id = ${row.id} AND user_id = ${userId}`);
        }
        for (const { before } of change.updated) {
          const columns = Object.keys(before).filter((column) => column !== 'id');
          const list = sql.join(
            columns.map((column) => sql.identifier(column)),
            sql`, `,
          );
          await tx.execute(sql`
            UPDATE ${name} SET (${list}) = (
              SELECT ${list} FROM jsonb_populate_record(NULL::${name}, ${JSON.stringify(before)}::jsonb)
            )
            WHERE id = ${before.id} AND user_id = ${userId}
          `);
        }
      }
    });
    // What the call deleted comes back from the trash, with whatever went with it.
    for (const item of undo.trash) {
      await this.trash.restore(userId, item);
    }
  }

  private async rows(userId: string, table: PgTable): Promise<DbRow[]> {
    const { rows } = await this.db.execute<{ row: DbRow }>(sql`
      SELECT to_jsonb(t) AS row FROM ${sql.identifier(getTableName(table))} t
      WHERE t.user_id = ${userId}
    `);
    return rows.map((one) => one.row);
  }
}
