import {LifelogGenerated} from '@pd/contracts';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {configureFieldEncryption} from '../crypto/encrypted-columns';
import {LifelogService} from './lifelog.service';
import {LifelogJob} from './lifelog.job';

const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const DB_NAME = `lifelog_test_${process.pid}`;
const migrationsFolder = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);

describe.skipIf(!ADMIN_URL)(
  'LifelogService repository',
  {timeout: 60_000},
  () => {
    let admin: Pool;
    let pool: Pool;
    let service: LifelogService;
    const user = randomUUID();
    const other = randomUUID();
    const day = '2026-10-01';
    const generated: LifelogGenerated = {
      summaryText: 'A focused day.',
      keyHighlight: 'Finished a task.',
      generatedBy: 'ai',
      sources: [{module: 'tasks', key: 'tasks.life.done', at: null}],
    };

    beforeAll(async () => {
      configureFieldEncryption(
        'lifelog-repository-test-key-not-for-production',
      );
      admin = new Pool({connectionString: ADMIN_URL});
      await admin.query(`CREATE DATABASE ${DB_NAME}`);
      const url = new URL(ADMIN_URL as string);
      url.pathname = `/${DB_NAME}`;
      pool = new Pool({connectionString: url.toString()});
      pool.on('error', () => undefined);
      const db = drizzle({client: pool, casing: 'snake_case'});
      await migrate(db, {migrationsFolder});
      await migrate(db, {migrationsFolder});
      await pool.query(
        'INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4), ($5, $6, $3, $4)',
        [user, 'lifelog@test', 'hash', 'Test', other, 'other-lifelog@test'],
      );
      service = new LifelogService(db);
    });

    afterAll(async () => {
      await pool?.end();
      await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
      await admin?.end();
    });

    it('keeps one narrative per user/day and preserves the personal note', async () => {
      await service.saveNote(user, day, 'A personal addition.');
      const first = await service.saveGenerated(user, day, generated);
      const second = await service.saveGenerated(user, day, {
        ...generated,
        summaryText: 'Updated story.',
      });
      expect(first.id).toBe(second.id);
      expect(second.note).toBe('A personal addition.');
      expect((await service.list(user, {from: day, to: day})).length).toBe(1);
      expect(await service.get(other, day)).toBeNull();
    });

    it('stores private text encrypted and filters every operation by owner', async () => {
      await service.saveNote(user, day, 'Private note.');
      const {rows} = await pool.query(
        'SELECT note, summary_text FROM lifelog_narratives WHERE user_id = $1 AND day = $2',
        [user, day],
      );
      expect(rows[0].note).toMatch(/^enc:v1:/);
      expect(rows[0].summary_text).toMatch(/^enc:v1:/);
      await service.remove(other, day);
      expect((await service.get(user, day))?.note).toBe('Private note.');
      await service.saveNote(other, day, 'Other owner.');
      await service.remove(user, day);
      expect(await service.get(user, day)).toBeNull();
      expect((await service.get(other, day))?.note).toBe('Other owner.');
    });

    it('validates internal calls before reaching the database', async () => {
      await expect(
        service.list(user, {from: '2026-10-31', to: day}),
      ).rejects.toThrow();
      await expect(
        service.saveGenerated(user, day, {...generated, sources: []}),
      ).rejects.toThrow();
      await expect(service.saveNote(user, '2026-02-30', '')).rejects.toThrow();
    });

    it('defaults to off and atomically claims one nightly attempt despite parallel jobs', async () => {
      expect(await service.settings(user)).toEqual({enabled: false});
      await service.configure(user, {enabled: true});
      expect(await service.settings(other)).toEqual({enabled: false});
      const generate = vi.fn().mockResolvedValue(null);
      const job = new LifelogJob(
        drizzle({client: pool, casing: 'snake_case'}),
        {} as never,
        {
          findById: async () => ({locale: 'en'}),
          timeZoneOf: () => 'UTC',
        } as never,
        {generate} as never,
      );
      const now = new Date('2026-10-02T04:00:00Z');
      await Promise.all([job.run(now), job.run(now)]);
      await job.run(now);
      expect(generate).toHaveBeenCalledExactlyOnceWith(user, day);
      await service.configure(user, {enabled: false});
      await job.run(new Date('2026-10-03T04:00:00Z'));
      expect(generate).toHaveBeenCalledTimes(1);
    });
  },
);
