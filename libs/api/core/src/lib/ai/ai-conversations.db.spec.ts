import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { Database } from '../database/database.module';
import { users } from '../users/users.schema';
import { AiConversationsService } from './ai-conversations.service';
import { AiService } from './ai.service';

/**
 * Stored conversations on a real database, with the model replaced by a stub. Needs PostgreSQL:
 * set TEST_DATABASE_URL like for `sync-store.db.spec.ts`; a scratch database is created and
 * dropped afterwards.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../apps/api/migrations');
const DATABASE = 'pd_test_ai_conversations';

describe.skipIf(!ADMIN_URL)('AiConversationsService', { timeout: 60_000 }, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let service: AiConversationsService;
  /** What the stub model was given on each call. */
  const seen: { role: string; content: string }[][] = [];
  const userId = randomUUID();

  beforeAll(async () => {
    admin = new Pool({ connectionString: ADMIN_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DATABASE}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DATABASE}`;
    pool = new Pool({ connectionString: url.toString() });
    pool.on('error', () => undefined);
    db = drizzle({ client: pool, casing: 'snake_case' });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    await db
      .insert(users)
      .values({ id: userId, email: 'ai@test.local', passwordHash: 'x', displayName: 'Test' });

    const ai = {
      ask: async (_userId: string, history: { role: string; content: string }[]) => {
        seen.push(history);
        return { reply: `answer ${seen.length}`, toolsUsed: ['diary'] };
      },
    } as unknown as AiService;
    service = new AiConversationsService(db as unknown as Database, ai);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin?.end();
  });

  it('keeps one conversation going across questions, as after a restart', async () => {
    expect(await service.current(userId)).toBeNull();

    const first = await service.ask(userId, { content: 'How was my week?' }, {});
    // Nothing lives in memory: the second question finds the first one in the database.
    const second = await service.ask(userId, { content: 'And the week before?' }, {});

    expect(second.conversationId).toBe(first.conversationId);
    expect(seen[1].map((m) => m.content)).toEqual([
      'How was my week?',
      'answer 1',
      'And the week before?',
    ]);
    const current = await service.current(userId);
    expect(current?.title).toBe('How was my week?');
    expect(current?.messages.map((m) => [m.role, m.content, m.toolsUsed])).toEqual([
      ['user', 'How was my week?', []],
      ['assistant', 'answer 1', ['diary']],
      ['user', 'And the week before?', []],
      ['assistant', 'answer 2', ['diary']],
    ]);
  });

  it('starts anew, and an old conversation continued becomes the current one', async () => {
    const old = (await service.current(userId))!;
    const fresh = await service.start(userId);
    expect((await service.current(userId))?.id).toBe(fresh.id);

    await service.ask(
      userId,
      { content: 'Hello', attachments: [{ name: 'a.csv', text: '1;2' }] },
      {},
    );
    expect(seen.at(-1)).toEqual([
      { role: 'user', content: 'Hello', attachments: [{ name: 'a.csv', text: '1;2' }] },
    ]);
    expect((await service.current(userId))?.messages[0].attachments).toEqual(['a.csv']);

    await service.ask(userId, { conversationId: old.id, content: 'Back to it' }, {});
    expect((await service.current(userId))?.id).toBe(old.id);
    expect((await service.list(userId)).map((c) => c.id)).toEqual([old.id, fresh.id]);
  });

  it("does not open another user's conversation", async () => {
    const [conversation] = await service.list(userId);
    await expect(service.get(randomUUID(), conversation.id)).rejects.toThrow('not found');
  });
});
