import {sql} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import type {AiConnectionsService} from '../ai/ai-connections.service';
import {Database} from '../database/database.module';
import type {SchedulerService} from '../scheduler/scheduler.service';
import type {UsersService} from '../users/users.service';
import type {RecallItem} from './recall-math';
import {RecallService} from './recall.service';

/** A model of meaning that counts words: texts that share words are close. */
const WORDS = [
  'knee',
  'running',
  'pain',
  'dentist',
  'crown',
  'tooth',
  'garden',
  'move',
  'flat',
];
const embedded: string[] = [];
vi.mock('../ai/openai-compatible.client', () => ({
  embed: async (_connection: unknown, texts: string[]) => {
    embedded.push(...texts);
    return texts.map(text =>
      WORDS.map(word => (text.toLowerCase().includes(word) ? 1 : 0)),
    );
  },
}));

/**
 * Search by meaning on a real database, with a word-counting model: the index is built, kept
 * up to date without asking the model twice, and searched only in the sections the AI may see.
 * Needs PostgreSQL: set TEST_DATABASE_URL like for `sync-store.db.spec.ts`.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DATABASE = 'pd_test_recall';

describe.skipIf(!ADMIN_URL)('RecallService', {timeout: 60_000}, () => {
  let admin: Pool;
  let pool: Pool;
  let db: Database;
  let recall: RecallService;
  const userId = randomUUID();
  let hidden: string[] = [];
  let diary: RecallItem[] = [];
  const item = (id: string, text: string): RecallItem => ({
    id,
    title: `Diary, ${id}`,
    text,
    date: id,
    link: `/diary?day=${id}`,
  });

  beforeAll(async () => {
    admin = new Pool({connectionString: ADMIN_URL});
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DATABASE}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DATABASE}`;
    pool = new Pool({connectionString: url.toString()});
    pool.on('error', () => undefined);
    const drizzleDb = drizzle({client: pool, casing: 'snake_case'});
    await migrate(drizzleDb, {migrationsFolder: MIGRATIONS});
    db = drizzleDb as unknown as Database;
    const connections = {
      embedding: async () => ({
        baseUrl: 'http://ollama',
        model: 'words',
        apiKey: null,
      }),
      hiddenFromShared: async () => hidden,
    } as unknown as AiConnectionsService;
    const users = {
      findById: async () => undefined,
      hiddenSections: () => [],
    } as unknown as UsersService;
    recall = new RecallService(
      db,
      connections,
      {register: () => undefined} as unknown as SchedulerService,
      users,
    );
    recall.register({module: 'diary', items: async () => diary});
    recall.register({
      module: 'health',
      items: async () => [
        {
          id: 'v1',
          title: 'Visit',
          text: 'Knee pain again',
          date: null,
          link: null,
        },
      ],
    });
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin?.end();
  });

  it('finds by meaning, with the text read from the section', async () => {
    diary = [
      item('2026-10-01', 'The dentist put a crown on the tooth'),
      item('2026-10-12', 'My knee hurts after running'),
      item('2026-10-15', 'Planted the garden'),
    ];
    const hits = await recall.search(userId, 'when did my knee hurt?');
    expect(hits?.map(hit => `${hit.module}:${hit.id}`)).toEqual([
      'diary:2026-10-12',
      'health:v1',
    ]);
    expect(hits?.[0]).toMatchObject({
      text: 'My knee hurts after running',
      link: '/diary?day=2026-10-12',
    });
  });

  it('asks the model only about new and changed items, and forgets the gone ones', async () => {
    embedded.length = 0;
    diary = [
      item('2026-10-01', 'The dentist put a crown on the tooth'),
      item('2026-10-12', 'My knee hurts after running, the pain is worse'),
      item('2026-10-20', 'Looking at a flat for the move'),
    ];
    expect(await recall.index(userId)).toBe(4);
    expect(embedded).toHaveLength(2);
    const rows = await db.execute<{item_id: string}>(
      sql`SELECT item_id FROM search.vectors WHERE user_id = ${userId} AND module = 'diary' ORDER BY item_id`,
    );
    expect(rows.rows.map(row => row.item_id)).toEqual([
      '2026-10-01',
      '2026-10-12',
      '2026-10-20',
    ]);
  });

  it('neither indexes nor searches a section kept from the AI', async () => {
    hidden = ['health'];
    const hits = await recall.search(userId, 'knee pain');
    expect(hits?.every(hit => hit.module !== 'health')).toBe(true);
    await recall.index(userId);
    expect(await recall.indexed(userId)).toBe(3);
    hidden = [];
  });
});
