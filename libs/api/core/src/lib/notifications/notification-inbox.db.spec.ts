import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {configureFieldEncryption} from '../crypto/encrypted-columns';
import {Database} from '../database/database.module';
import {UserRow, users} from '../users/users.schema';
import {NotificationActions} from './notification-actions';
import {NotificationInboxService} from './notification-inbox.service';
import {NotificationOutbox} from './notification-outbox';
import {NotificationAnswers} from './telegram/telegram-bot.service';

/**
 * The bell on a real database (TEST_DATABASE_URL, like `notification-outbox.db.spec.ts`): a
 * question is answered once, wherever it is pressed, and closed in Telegram when answered
 * elsewhere.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DATABASE = 'pd_test_notification_inbox';

describe.skipIf(!ADMIN_URL)(
  'NotificationInboxService',
  {timeout: 60_000},
  () => {
    let admin: Pool;
    let pool: Pool;
    let db: NodePgDatabase;
    let outbox: NotificationOutbox;
    let inbox: NotificationInboxService;
    let answers: NotificationAnswers;
    const actions = new NotificationActions();
    const closed: {messageId: number; text: string}[] = [];
    const emitted: string[] = [];
    const pressed: string[] = [];
    const closedOnPhones: string[] = [];
    const user = {id: randomUUID(), locale: 'en'} as UserRow;

    const question = (title: string) => ({
      title,
      body: 'How was it?',
      source: 'movies',
      actions: [
        {label: '8', action: 'mv:r:dune:8'},
        {label: '9', action: 'mv:r:dune:9'},
      ],
    });

    beforeAll(async () => {
      configureFieldEncryption('test-key-test-key-test-key-test-key');
      admin = new Pool({connectionString: ADMIN_URL});
      await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${DATABASE}`);
      const url = new URL(ADMIN_URL as string);
      url.pathname = `/${DATABASE}`;
      pool = new Pool({connectionString: url.toString()});
      pool.on('error', () => undefined);
      db = drizzle({client: pool, casing: 'snake_case'});
      await migrate(db, {migrationsFolder: MIGRATIONS});
      await db.insert(users).values({
        id: user.id,
        email: 'inbox@test.local',
        passwordHash: 'x',
        displayName: 'Test',
      });
      outbox = new NotificationOutbox(db as unknown as Database);
      actions.register({
        name: 'mv',
        handler: async (_user, payload) => {
          pressed.push(payload);
          return {
            reply: `Saved: ${payload.split(':')[2]}/10`,
            expectText: async (_u, text) => `Noted: ${text}`,
          };
        },
      });
      const telegram = {
        useAnswers: (given: NotificationAnswers) => (answers = given),
        closeMessage: async (message: {messageId: number}, text: string) =>
          void closed.push({messageId: message.messageId, text}),
      };
      inbox = new NotificationInboxService(
        db as unknown as Database,
        {findById: async () => user} as never,
        actions,
        telegram as never,
        {
          emit: (_id: string, event: {type: string}) =>
            void emitted.push(event.type),
        } as never,
        {
          close: async (_userId: string, id: string) =>
            void closedOnPhones.push(id),
        } as never,
      );
      inbox.onModuleInit();
    }, 60_000);

    afterAll(async () => {
      await pool?.end();
      await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
      await admin?.end();
    });

    it('answers a question once, keeps the words, and closes it in Telegram', async () => {
      const row = await outbox.add(
        user.id,
        question('Dune'),
        ['telegram'],
        'sending',
      );
      await outbox.setTelegramMessage(row!.id, {chatId: '42', messageId: 7});
      expect(await inbox.summary(user.id)).toEqual({unread: 1, waiting: 1});

      const [first, second] = await Promise.all([
        inbox.answer(user.id, row!.id, {action: 'mv:r:dune:8'}, 'web'),
        inbox.answer(user.id, row!.id, {action: 'mv:r:dune:9'}, 'push'),
      ]);
      // One press took it; the other only heard what was answered.
      expect(pressed).toHaveLength(1);
      const taken = first.expectsText ? first : second;
      expect(taken.reply).toMatch(/^Saved: \d\/10$/);
      expect([first, second].find(one => one !== taken)?.reply).toMatch(
        /^Already answered: \d$/,
      );

      const words = await inbox.answer(
        user.id,
        row!.id,
        {text: 'a slow middle'},
        'web',
      );
      expect(words.reply).toBe('Noted: a slow middle');
      expect(words.item.answer).toBe(`${taken.item.answer} · a slow middle`);
      expect(words.item.waiting).toBe(false);
      expect(closed.at(-1)?.text).toBe(
        `✅ Answered in the app: ${words.item.answer}`,
      );
      expect(await inbox.summary(user.id)).toEqual({unread: 0, waiting: 0});
      expect(emitted).toContain('inbox');
      // Answered in the app: the phones take it out of the shade (the one that answered does it
      // itself).
      expect(closedOnPhones).toContain(row!.id);
    });

    it('takes a press in Telegram as the answer, and leaves other messages to their handlers', async () => {
      const row = await outbox.add(
        user.id,
        question('Moana'),
        ['telegram'],
        'sending',
      );
      await outbox.setTelegramMessage(row!.id, {chatId: '42', messageId: 8});
      const before = closed.length;

      const result = await answers.button(
        user,
        {chatId: '42', messageId: 8},
        'mv:r:dune:9',
      );
      expect(result?.reply).toBe('Saved: 9/10');
      const item = await inbox.get(user.id, row!.id);
      expect(item.answer).toBe('9');
      expect(item.answeredVia).toBe('telegram');
      // Answered in Telegram itself: nothing to close there.
      expect(closed.length).toBe(before);
      expect(await answers.text(user, 'great songs')).toBe(
        'Noted: great songs',
      );
      expect((await inbox.get(user.id, row!.id)).answer).toBe(
        '9 · great songs',
      );

      expect(
        await answers.button(
          user,
          {chatId: '42', messageId: 999},
          'mv:r:dune:9',
        ),
      ).toBeNull();
    });

    it('refuses a button the notification does not have, and words nobody asked for', async () => {
      const row = await outbox.add(user.id, question('Up'), [], 'sent');
      await expect(
        inbox.answer(user.id, row!.id, {action: 'hb:c:x'}, 'web'),
      ).rejects.toThrow();
      await expect(
        inbox.answer(user.id, row!.id, {text: 'hello'}, 'web'),
      ).rejects.toThrow();
      expect((await inbox.get(user.id, row!.id)).waiting).toBe(true);
    });
  },
);
