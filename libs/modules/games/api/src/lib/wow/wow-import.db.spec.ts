import {WowAccountCharacter} from '@pd/contracts';
import {eq, sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {GameAccountsService} from '../game-accounts.service';
import {gameAccounts} from '../games.schema';
import {WowImportService} from './wow-import.service';

/** Runs against the generated migrations, like the other *.db.spec.ts. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../../apps/api/migrations',
);
const DB_NAME = `wow_import_test_${process.pid}`;

const priest: WowAccountCharacter = {
  id: 7,
  region: 'eu',
  version: 'retail',
  name: 'Массоночка',
  surname: null,
  realm: 'Вечная Песня',
  realmSlug: 'eversong',
  slug: 'массоночка',
  level: 80,
  className: 'Жрец',
};
const paladin: WowAccountCharacter = {
  id: 3431914,
  region: 'eu',
  version: 'forever',
  name: 'Око',
  surname: 'Масонское',
  realm: null,
  realmSlug: null,
  slug: 'око-масонское',
  level: 38,
  className: 'Паладин',
};
const answered = new Set(['eu/retail', 'eu/forever']);

describe.skipIf(!ADMIN_URL)(
  'characters of the Battle.net account on the Games page',
  {timeout: 60_000},
  () => {
    let admin: Pool;
    let pool: Pool;
    let db: NodePgDatabase;
    let accounts: GameAccountsService;
    let importer: WowImportService;
    const userId = randomUUID();

    const wowRows = () =>
      db
        .select()
        .from(gameAccounts)
        .where(eq(gameAccounts.userId, userId))
        .orderBy(gameAccounts.externalId);

    beforeAll(async () => {
      admin = new Pool({connectionString: ADMIN_URL});
      await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${DB_NAME}`);
      const url = new URL(ADMIN_URL as string);
      url.pathname = `/${DB_NAME}`;
      pool = new Pool({connectionString: url.toString()});
      pool.on('error', () => undefined);
      db = drizzle({client: pool, casing: 'snake_case'});
      await migrate(db, {migrationsFolder: MIGRATIONS});
      await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale)
      VALUES (${userId}, 'wow@test', 'hash', 'Test', 'en')`);
      accounts = new GameAccountsService(
        db as never,
        null as never,
        {remove: async () => undefined} as never,
        null as never,
        null as never,
        null as never,
        null as never,
        null as never,
      );
      // No Blizzard here: the refresh of the found characters is not what is tested.
      accounts.syncFound = async () => undefined;
      importer = new WowImportService(db as never, accounts);
    }, 60_000);

    afterAll(async () => {
      await pool?.end();
      await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
      await admin?.end();
    });

    it('links the hand-added character and adds the Forever one', async () => {
      await db.insert(gameAccounts).values({
        userId,
        game: 'wow',
        externalId: 'eu/eversong/массоночка',
        displayName: 'Массоночка — Вечная Песня',
      });
      await importer.import(userId, [priest, paladin], answered);
      const rows = await wowRows();
      expect(rows.map(r => [r.externalId, r.blizzardKey])).toEqual([
        ['eu//око-масонское/forever', 'eu/forever/3431914'],
        ['eu/eversong/массоночка', 'eu/retail/7'],
      ]);
    });

    it('does not bring back a removed character until it is added again', async () => {
      const forever = (await wowRows()).find(r =>
        r.blizzardKey?.includes('forever'),
      );
      await accounts.remove(userId, forever!.id);
      await importer.import(userId, [priest, paladin], answered);
      expect(await wowRows()).toHaveLength(1);
      expect(
        (await importer.statuses(userId, [paladin])).map(c => c.status),
      ).toEqual(['removed']);

      await importer.addOne(userId, paladin);
      expect(await wowRows()).toHaveLength(2);
      expect(
        (await importer.statuses(userId, [paladin])).map(c => c.status),
      ).toEqual(['added']);
    });

    it('marks a character gone from the account and unmarks it when back', async () => {
      await importer.import(userId, [paladin], answered);
      const gone = (await wowRows()).find(r => r.blizzardKey === 'eu/retail/7');
      expect(gone?.notOnAccountSince).toBeInstanceOf(Date);

      await importer.import(userId, [priest, paladin], answered);
      const back = (await wowRows()).find(r => r.blizzardKey === 'eu/retail/7');
      expect(back?.notOnAccountSince).toBeNull();
    });
  },
);
