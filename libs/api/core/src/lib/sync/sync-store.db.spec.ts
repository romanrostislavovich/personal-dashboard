import { Logger } from '@nestjs/common';
import { SyncChange } from '@pd/contracts';
import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { SyncStore } from './sync-store';

/**
 * Sync between two real databases. Needs PostgreSQL: set TEST_DATABASE_URL to a database whose
 * user may create databases, e.g. the one from `npm run db:up`:
 * `TEST_DATABASE_URL=postgres://dashboard:dashboard@localhost:5432/dashboard npx nx test api-core`
 * Two scratch databases are created next to it and dropped afterwards.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../apps/api/migrations');
/** A uuid[] literal: an array given to `sql` would turn into a row, not an array. */
const uuids = (ids: string[]) => `{${ids.join(',')}}`;
/** Far older than any change made by the test. */
const LONG_AGO = '2000-01-01T00:00:00Z';

interface Side {
  name: string;
  pool: Pool;
  db: NodePgDatabase;
  store: SyncStore;
}

describe.skipIf(!ADMIN_URL)('SyncStore on two databases', { timeout: 60_000 }, () => {
  let admin: Pool;
  let server: Side;
  let client: Side;
  /** The client's pull cursor on the server's change log. */
  let pulled: string | null = null;
  const userId = randomUUID();

  const openSide = async (name: string): Promise<Side> => {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${name}`;
    const pool = new Pool({ connectionString: url.toString() });
    // A connection closed by the database at the end must not become an unhandled error.
    pool.on('error', () => undefined);
    const db = drizzle({ client: pool, casing: 'snake_case' });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    const store = new SyncStore(db);
    await store.init();
    return { name, pool, db, store };
  };

  /**
   * Sync reads only transactions older than every one still open in the PostgreSQL cluster —
   * other databases included (say, a local instance catching up on the same server). Wait until
   * this side's latest change is past that point.
   */
  const settle = async (side: Side) => {
    for (let attempt = 0; attempt < 600; attempt++) {
      const [{ ready }] = await rows<{ ready: boolean }>(
        side,
        sql`SELECT coalesce(max(tx) < pg_snapshot_xmin(pg_current_snapshot()), true) AS ready
          FROM sync.row_versions`,
      );
      if (ready) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('A transaction elsewhere in the cluster stays open for too long');
  };

  /** Server changes made since the last pull. */
  const serverChanges = async (): Promise<SyncChange[]> => {
    await settle(server);
    const batch = await server.store.changesSince(pulled, (origin) => origin === null);
    pulled = batch.cursor;
    return batch.changes;
  };

  const pull = async (unsentAfter?: string | null) =>
    client.store.apply(await serverChanges(), { origin: 'server', unsentAfter });

  /** Where the client's change log ends now — its push cursor if it pushed right now. */
  const pushCursor = async (): Promise<string | null> => {
    await settle(client);
    let cursor: string | null = null;
    for (;;) {
      const batch = await client.store.changesSince(cursor, () => false);
      cursor = batch.cursor;
      if (!batch.hasMore) {
        return cursor;
      }
    }
  };

  /** Change times come from the clock: make sure the next change is strictly newer. */
  const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

  const rows = async <T extends Record<string, unknown>>(
    side: Side,
    query: ReturnType<typeof sql>,
  ) => (await side.db.execute<T>(query)).rows;

  const conflicts = (id: string) =>
    rows<{ reason: string; row: Record<string, unknown> }>(
      client,
      sql`SELECT reason, row FROM sync.conflicts WHERE row->>'id' = ${id} ORDER BY created_at`,
    );

  const addBirthday = async (side: Side, id: string, name = 'Bob') => {
    await side.db.execute(sql`INSERT INTO birthdays (id, user_id, name, month, day)
      VALUES (${id}, ${userId}, ${name}, 1, 2)`);
  };

  const addUser = async (side: Side, id: string) => {
    await side.db.execute(sql`INSERT INTO users (id, email, password_hash, display_name)
      VALUES (${id}, ${`${id}@test`}, 'hash', 'Test')`);
  };

  beforeAll(async () => {
    Logger.overrideLogger(false);
    admin = new Pool({ connectionString: ADMIN_URL });
    const suffix = process.pid;
    server = await openSide(`sync_test_server_${suffix}`);
    client = await openSide(`sync_test_client_${suffix}`);
    await addUser(server, userId);
    await pull(null);
  }, 60_000);

  afterAll(async () => {
    for (const side of [server, client].filter(Boolean)) {
      await side.pool.end();
      await dropScratchDatabase(admin, side.name);
    }
    await admin?.end();
    Logger.overrideLogger(['log', 'error', 'warn']);
  });

  it('copies new rows', async () => {
    const id = randomUUID();
    await addBirthday(server, id);
    expect(await pull()).toEqual({ applied: 1, skipped: 0, parked: 0 });
    expect(await rows(client, sql`SELECT name FROM birthdays WHERE id = ${id}`)).toEqual([
      { name: 'Bob' },
    ]);
  });

  it('a newer change overwrites an unsent local one; the local version is kept', async () => {
    const id = randomUUID();
    await addBirthday(server, id);
    await pull();
    const cursor = await pushCursor();
    await client.db.execute(sql`UPDATE birthdays SET note = 'client' WHERE id = ${id}`);
    await tick();
    await server.db.execute(sql`UPDATE birthdays SET note = 'server' WHERE id = ${id}`);

    expect(await pull(cursor)).toEqual({ applied: 1, skipped: 0, parked: 0 });
    expect(await rows(client, sql`SELECT note FROM birthdays WHERE id = ${id}`)).toEqual([
      { note: 'server' },
    ]);
    const kept = await conflicts(id);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      reason: 'overwritten by a newer change',
      row: { note: 'client' },
    });
  });

  it('skips an older change and keeps it, unless it equals the current row', async () => {
    const id = randomUUID();
    await addBirthday(server, id);
    await pull();
    const [{ row }] = await rows<{ row: string }>(
      client,
      sql`SELECT to_jsonb(t)::text AS row FROM birthdays t WHERE id = ${id}`,
    );
    const stale = { table: 'birthdays', pk: JSON.stringify({ id }), changedAt: LONG_AGO };
    const changes: SyncChange[] = [
      { ...stale, row: row.replace('"Bob"', '"Old"') },
      { ...stale, row },
      { ...stale, row: null },
    ];

    expect(await client.store.apply(changes, { origin: 'server' })).toEqual({
      applied: 0,
      skipped: 3,
      parked: 0,
    });
    const kept = await conflicts(id);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ reason: 'older than the local version', row: { name: 'Old' } });
  });

  it('parks a row whose parent has not arrived yet and applies it later', async () => {
    const parentId = randomUUID();
    const childId = randomUUID();
    await addUser(server, parentId);
    await server.db.execute(sql`INSERT INTO birthdays (id, user_id, name, month, day)
      VALUES (${childId}, ${parentId}, 'Ann', 3, 4)`);
    const changes = await serverChanges();
    const child = changes.filter((change) => change.table === 'birthdays');
    const parent = changes.filter((change) => change.table === 'users');

    expect(await client.store.apply(child, { origin: 'server' })).toMatchObject({ parked: 1 });
    expect((await client.store.problemCounts()).parked).toBe(1);

    expect(await client.store.apply(parent, { origin: 'server' })).toMatchObject({ applied: 1 });
    expect((await client.store.problemCounts()).parked).toBe(0);
    expect(await rows(client, sql`SELECT name FROM birthdays WHERE id = ${childId}`)).toEqual([
      { name: 'Ann' },
    ]);
  });

  it('two rows with the same unique key: the newer one stays, the other is kept', async () => {
    const entry = (side: Side, id: string, day: string) =>
      side.db.execute(sql`INSERT INTO diary_entries (id, user_id, day, content)
        VALUES (${id}, ${userId}, ${day}, ${side === server ? 'server' : 'client'})`);
    const [olderLocal, newerRemote, olderRemote, newerLocal] = [1, 2, 3, 4].map(() => randomUUID());
    await entry(client, olderLocal, '2026-02-01');
    await tick();
    await entry(server, newerRemote, '2026-02-01');
    await entry(server, olderRemote, '2026-03-01');
    await tick();
    await entry(client, newerLocal, '2026-03-01');

    expect(await pull()).toEqual({ applied: 1, skipped: 1, parked: 0 });
    const days = await rows(
      client,
      sql`SELECT day::text, content FROM diary_entries WHERE day IN ('2026-02-01', '2026-03-01')
        ORDER BY day`,
    );
    expect(days).toEqual([
      { day: '2026-02-01', content: 'server' },
      { day: '2026-03-01', content: 'client' },
    ]);
    expect(await conflicts(olderLocal)).toMatchObject([{ reason: 'lost to a newer row' }]);
    expect(await conflicts(olderRemote)).toMatchObject([{ reason: 'lost to a newer row' }]);
  });

  it('deletes rows', async () => {
    const id = randomUUID();
    await addBirthday(server, id);
    await pull();
    await server.db.execute(sql`DELETE FROM birthdays WHERE id = ${id}`);

    expect(await pull()).toEqual({ applied: 1, skipped: 0, parked: 0 });
    expect(await rows(client, sql`SELECT id FROM birthdays WHERE id = ${id}`)).toEqual([]);
  });

  it('copies thousands of rows in batches, with a few conflicts among them', async () => {
    const count = 5_000;
    const playedAt = (n: number) => sql`'2026-01-01'::timestamptz - make_interval(mins => ${n})`;
    // The same play (unique: user + time + track) already here under another id — and older,
    // so the incoming one wins and this one is kept as a conflict.
    await client.db.execute(sql`INSERT INTO music_scrobbles (user_id, played_at, artist, track)
      VALUES (${userId}, ${playedAt(7)}, 'Old', 'Track 7')`);
    await pushCursor();
    await tick();
    await server.db.execute(sql`
      INSERT INTO music_scrobbles (user_id, played_at, artist, track)
      SELECT ${userId}, '2026-01-01'::timestamptz - make_interval(mins => n),
        'Artist ' || n % 50, 'Track ' || n
      FROM generate_series(1, ${count}) AS n
    `);

    const started = Date.now();
    const total = { applied: 0, skipped: 0, parked: 0 };
    for (;;) {
      await settle(server);
      const batch = await server.store.changesSince(pulled, (origin) => origin === null);
      pulled = batch.cursor;
      const result = await client.store.apply(batch.changes, { origin: 'server' });
      total.applied += result.applied;
      total.skipped += result.skipped;
      total.parked += result.parked;
      if (!batch.hasMore) {
        break;
      }
    }
    // Row by row this took ~20 s; in bulk ~1.5 s. A generous bound catches a return to row by row.
    expect(Date.now() - started).toBeLessThan(10_000);

    expect(total).toEqual({ applied: count, skipped: 0, parked: 0 });
    const [{ copied }] = await rows<{ copied: number }>(
      client,
      sql`SELECT count(*)::int AS copied FROM music_scrobbles WHERE artist <> 'Old'`,
    );
    expect(copied).toBe(count);
    // The older local duplicate lost to the incoming play and is kept as a conflict.
    const [{ kept }] = await rows<{ kept: number }>(
      client,
      sql`SELECT count(*)::int AS kept FROM sync.conflicts
        WHERE table_name = 'music_scrobbles' AND row->>'artist' = 'Old'`,
    );
    expect(kept).toBe(1);
  });

  it('two versions changed at the same moment: both sides keep the same one', async () => {
    const version = (id: string, name: string) => ({
      table: 'birthdays',
      pk: JSON.stringify({ id }),
      changedAt: LONG_AGO,
      row: JSON.stringify({
        id,
        user_id: userId,
        name,
        month: 5,
        day: 6,
        remind_days_before: [0],
        created_at: LONG_AGO,
      }),
    });
    // The same pair of versions arrives in the opposite order, as on the two sides.
    const [first, second] = [randomUUID(), randomUUID()];
    for (const [id, local, incoming] of [
      [first, 'Anna', 'Zoe'],
      [second, 'Zoe', 'Anna'],
    ]) {
      await client.store.apply([version(id, local)], { origin: 'server' });
      await client.store.apply([version(id, incoming)], { origin: 'server' });
    }

    const names = await rows<{ name: string }>(
      client,
      sql`SELECT name FROM birthdays WHERE id = ANY(${uuids([first, second])}::uuid[])`,
    );
    expect(names).toEqual([{ name: 'Zoe' }, { name: 'Zoe' }]);
  });

  it('deletes many rows in bulk', async () => {
    const ids = Array.from({ length: 10 }, () => randomUUID());
    for (const id of ids) {
      await addBirthday(server, id);
    }
    await pull();
    await server.db.execute(sql`DELETE FROM birthdays WHERE id = ANY(${uuids(ids)}::uuid[])`);

    expect(await pull()).toEqual({ applied: 10, skipped: 0, parked: 0 });
    expect(
      await rows(client, sql`SELECT id FROM birthdays WHERE id = ANY(${uuids(ids)}::uuid[])`),
    ).toEqual([]);
  });

  it('a run that fails in bulk goes row by row: the bad row is parked', async () => {
    const ids = Array.from({ length: 4 }, () => randomUUID());
    const orphan = randomUUID();
    const change = (id: string, user: string) => ({
      table: 'birthdays',
      pk: JSON.stringify({ id }),
      changedAt: new Date().toISOString(),
      row: JSON.stringify({
        id,
        user_id: user,
        name: 'Bulk',
        month: 3,
        day: 4,
        remind_days_before: [0],
        created_at: new Date().toISOString(),
      }),
    });
    // The last row's user does not exist here: the bulk insert fails as a whole.
    const result = await client.store.apply(
      [...ids.map((id) => change(id, userId)), change(orphan, randomUUID())],
      { origin: 'server' },
    );

    expect(result).toEqual({ applied: 4, skipped: 0, parked: 1 });
    const applied = await rows<{ n: number }>(
      client,
      sql`SELECT count(*)::int AS n FROM birthdays WHERE id = ANY(${uuids(ids)}::uuid[])`,
    );
    expect(applied).toEqual([{ n: 4 }]);
    const [parked] = await rows<{ error: string }>(
      client,
      sql`SELECT error FROM sync.parked WHERE pk = ${JSON.stringify({ id: orphan })}::jsonb`,
    );
    expect(parked.error).toContain('INSERT INTO "birthdays"');
  });

  it('parks a change for a table this side does not know', async () => {
    const change = { table: 'from_the_future', pk: '{"id":1}', changedAt: LONG_AGO, row: '{}' };
    expect(await client.store.apply([change], { origin: 'server' })).toMatchObject({ parked: 1 });
    const [parked] = await rows<{ error: string }>(
      client,
      sql`SELECT error FROM sync.parked WHERE table_name = 'from_the_future'`,
    );
    expect(parked.error).toContain('Unknown table');
  });
});

/**
 * Drops a scratch database once our own connections to it are gone. `pool.end()` resolves while
 * they may still be closing, and dropping WITH (FORCE) then kills them: pg reports
 * "terminating connection due to administrator command" as an unhandled error (seen in CI).
 */
async function dropScratchDatabase(admin: Pool, name: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const { rows } = await admin.query<{ open: number }>(
      'SELECT count(*)::int AS open FROM pg_stat_activity WHERE datname = $1',
      [name],
    );
    if (rows[0].open === 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
}
