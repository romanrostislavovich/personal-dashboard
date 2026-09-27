import { sql, SQL } from 'drizzle-orm';
import { Database } from '../database/database.module';
import { SyncTable } from './sync-catalog';

/** Set for the transaction that applies changes from the other side: they are not re-logged. */
export const APPLYING_SETTING = 'pd.sync_applying';

const TRIGGER_NAME = 'sync_track';

/**
 * Logs every insert, update and delete of a row into `sync.row_versions`.
 * Trigger arguments are the primary key columns of the table.
 */
const TRACK_FUNCTION = sql.raw(`
CREATE OR REPLACE FUNCTION sync.track_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  data jsonb;
  key jsonb := '{}'::jsonb;
  col text;
BEGIN
  IF current_setting('${APPLYING_SETTING}', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN data := to_jsonb(OLD); ELSE data := to_jsonb(NEW); END IF;
  FOREACH col IN ARRAY TG_ARGV LOOP
    key := key || jsonb_build_object(col, data -> col);
  END LOOP;
  INSERT INTO sync.row_versions (table_name, pk, changed_at, tx, seq, origin)
  VALUES (TG_TABLE_NAME, key, clock_timestamp(), pg_current_xact_id(), nextval('sync.change_seq'), NULL)
  ON CONFLICT (table_name, pk) DO UPDATE
    SET changed_at = EXCLUDED.changed_at, tx = EXCLUDED.tx, seq = EXCLUDED.seq, origin = NULL;
  RETURN NULL;
END $$;
`);

/**
 * Makes sure every synced table is tracked. A table seen for the first time gets the trigger
 * and a version for each existing row, dated at the epoch: any real change wins over it.
 * Both happen in one transaction, so no concurrent write slips between them.
 */
export async function installSyncTriggers(db: Database, tables: SyncTable[]): Promise<string[]> {
  const installed: string[] = [];
  await db.transaction(async (tx) => {
    // Two instances starting against one database must not install twice.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('pd.sync.install'))`);
    await tx.execute(TRACK_FUNCTION);
    const { rows } = await tx.execute<{ table: string }>(sql`
      SELECT c.relname AS table FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND t.tgname = ${TRIGGER_NAME}
    `);
    const tracked = new Set(rows.map((row) => row.table));
    for (const table of tables.filter((t) => !tracked.has(t.name))) {
      const name = sql.identifier(table.name);
      const args = sql.raw(table.primaryKey.map((col) => `'${col}'`).join(', '));
      await tx.execute(sql`
        CREATE TRIGGER ${sql.identifier(TRIGGER_NAME)} AFTER INSERT OR UPDATE OR DELETE ON ${name}
        FOR EACH ROW EXECUTE FUNCTION sync.track_change(${args})
      `);
      await tx.execute(sql`
        INSERT INTO sync.row_versions (table_name, pk, changed_at, tx, seq, origin)
        SELECT ${table.name}, ${pkObject(table, sql`to_jsonb(t)`)}, 'epoch',
          pg_current_xact_id(), nextval('sync.change_seq'), NULL
        FROM ${name} t
        ON CONFLICT DO NOTHING
      `);
      installed.push(table.name);
    }
  });
  return installed;
}

/** `{"col": value, …}` of the primary key, built exactly like the trigger does. */
export function pkObject(table: SyncTable, row: SQL): SQL {
  const parts = table.primaryKey.map((col) => sql`${col}::text, ${row} -> ${col}::text`);
  return sql`jsonb_build_object(${sql.join(parts, sql`, `)})`;
}
