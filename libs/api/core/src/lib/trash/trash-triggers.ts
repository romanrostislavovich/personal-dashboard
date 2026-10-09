import { sql } from 'drizzle-orm';
import { Database } from '../database/database.module';
import { APPLYING_SETTING } from '../sync/sync-triggers';

/** Set for work that deletes rows without the user asking (restoring the trash itself). */
export const TRASH_OFF_SETTING = 'pd.trash_off';

const TRIGGER_NAME = 'trash_keep';

/**
 * Tables whose deletions are housekeeping, not the user's: they never go to the trash. A deleted
 * API key must be gone; old check results and the AI log are cleaned up on schedule.
 */
const NOT_TRASHED = new Set([
  'users',
  'user_secrets',
  'monitoring_check_results',
  'ai_actions',
  'morning_digest_snapshots',
  'security_reports',
  // A note of what the user was told about: nothing to restore.
  'integration_alerts',
]);

/**
 * Keeps every deleted row in `trash.rows`. Deletions that came from the other instance (sync)
 * are skipped: they are in the trash where they were made.
 */
const KEEP_FUNCTION = sql.raw(`
CREATE OR REPLACE FUNCTION trash.keep_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  data jsonb := to_jsonb(OLD);
BEGIN
  IF current_setting('${APPLYING_SETTING}', true) = 'on'
    OR current_setting('${TRASH_OFF_SETTING}', true) = 'on' THEN
    RETURN NULL;
  END IF;
  INSERT INTO trash.rows (user_id, tx, table_name, row)
  VALUES ((data ->> 'user_id')::uuid, pg_current_xact_id(), TG_TABLE_NAME, data);
  RETURN NULL;
END $$;
`);

/**
 * Makes sure every table of `public` (except NOT_TRASHED) keeps its deleted rows; a new module's
 * table is picked up on the next start. Returns the tables it was added to.
 */
export async function installTrashTriggers(db: Database): Promise<string[]> {
  const installed: string[] = [];
  await db.transaction(async (tx) => {
    // Two instances starting against one database must not install twice.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('pd.trash.install'))`);
    await tx.execute(KEEP_FUNCTION);
    const { rows } = await tx.execute<{ name: string; tracked: boolean }>(sql`
      SELECT c.relname AS name,
        EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgname = ${TRIGGER_NAME})
          AS tracked
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `);
    for (const { name } of rows.filter((row) => !row.tracked && !NOT_TRASHED.has(row.name))) {
      await tx.execute(sql`
        CREATE TRIGGER ${sql.identifier(TRIGGER_NAME)} AFTER DELETE ON ${sql.identifier(name)}
        FOR EACH ROW EXECUTE FUNCTION trash.keep_deleted()
      `);
      installed.push(name);
    }
  });
  return installed;
}
