import {DeviceAuthService} from '@pd/api-core';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {configureFieldEncryption} from '@pd/api-core/schema';
import {
  TelemetryBucket,
  WorkstateInput,
  workstateRestorePlanSchema,
} from '@pd/contracts';
import {and, eq, sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {activityWorkstates, telemetryDynamics} from './activity-context.schema';
import {ActivityContextStore} from './activity-context.store';
import {activitySettings} from './activity.schema';
import {DevicesService} from './devices.service';
import {TelemetryService} from './telemetry.service';
import {WorkstateService} from './workstate.service';
import {ActivityService} from './activity.service';
import {TelemetrySummaryService} from './telemetry-summary.service';
import {telemetryDailyMetrics} from './telemetry-summary.views';

/** Runs against generated migrations after schema integration, like sites.db.spec.ts. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DB_NAME = `activity_context_test_${process.pid}`;

describe.skipIf(!ADMIN_URL)(
  'activity context repository',
  {timeout: 60_000},
  () => {
    let admin: Pool;
    let pool: Pool;
    let db: NodePgDatabase;
    let telemetry: TelemetryService;
    let workstates: WorkstateService;
    let devices: DevicesService;
    let deviceId: string;
    let otherDeviceId: string;
    let token: string;
    const userId = randomUUID();
    const otherUserId = randomUUID();
    const at = () => new Date(Date.now() - 60_000).toISOString();
    const capture = (note = 'Resume dashboard tests'): WorkstateInput => ({
      id: randomUUID(),
      capturedAt: at(),
      capture: {
        activeApp: 'WebStorm',
        projectPath: '/work/dashboard',
        gitBranch: 'feature/context',
        note,
        browserUrls: ['https://example.com/docs?q=removed'],
      },
    });
    const bucket = (): TelemetryBucket => ({
      id: randomUUID(),
      source: 'browser',
      startedAt: at(),
      endedAt: new Date().toISOString(),
      metrics: {readingSeconds: 20, copyCount: 2},
      page: {
        url: 'https://example.com/docs',
        title: 'TypeScript guide',
        technologies: ['TypeScript'],
      },
    });

    beforeAll(async () => {
      configureFieldEncryption('activity-context-database-test-encryption-key');
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
      VALUES (${userId}, 'context@test', 'hash', 'Test', 'en'),
             (${otherUserId}, 'other-context@test', 'hash', 'Other', 'en')`);
      devices = new DevicesService(db as never, new DeviceAuthService());
      const device = await devices.register(userId, {
        name: 'PC',
        platform: 'windows',
      });
      deviceId = device.id;
      token = device.token;
      otherDeviceId = (
        await devices.register(otherUserId, {
          name: 'Other PC',
          platform: 'windows',
        })
      ).id;
      const context = new ActivityContextStore(db as never);
      telemetry = new TelemetryService(db as never, context);
      workstates = new WorkstateService(db as never, context);
    }, 60_000);

    beforeEach(async () => {
      for (const owner of [userId, otherUserId]) {
        await telemetry.clear(owner);
        await workstates.clear(owner);
        await db
          .delete(activitySettings)
          .where(eq(activitySettings.userId, owner));
      }
    });

    afterAll(async () => {
      await pool?.end();
      await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
      await admin?.end();
    });

    it('keeps concurrent telemetry retries idempotent without cross-owner ID collisions', async () => {
      const input = {buckets: [bucket()]};
      const results = await Promise.all([
        telemetry.record(userId, input),
        telemetry.record(userId, input),
      ]);
      expect(results.reduce((sum, result) => sum + result.saved, 0)).toBe(1);
      expect(await telemetry.record(otherUserId, input)).toEqual({saved: 1});
      expect((await telemetry.list(userId, {})).items).toHaveLength(1);
      await telemetry.remove(otherUserId, input.buckets[0].id);
      expect((await telemetry.list(userId, {})).items).toHaveLength(1);
      expect((await telemetry.list(otherUserId, {})).items).toHaveLength(0);
      const raw = await pool.query(
        'SELECT page, metrics FROM telemetry_dynamics WHERE user_id = $1',
        [userId],
      );
      expect(raw.rows[0].page).toMatch(/^enc:v1:/);
      expect(raw.rows[0].page).not.toContain('example.com');
      expect(raw.rows[0].metrics).toEqual(input.buckets[0].metrics);
    });

    it('authenticates device ownership and only attaches verified device IDs', async () => {
      const device = await devices.authenticate(`Device ${token}`);
      expect(device.userId).toBe(userId);
      await expect(
        devices.authenticate('Device invalid'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      const input = capture();
      await expect(
        workstates.capture(userId, input, otherDeviceId),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      const state = await workstates.capture(device.userId, input, device.id);
      expect(state.deviceId).toBe(deviceId);
      await expect(workstates.capture(userId, input)).rejects.toBeInstanceOf(
        ConflictException,
      );
      const desktop = {
        ...bucket(),
        source: 'desktop' as const,
        page: undefined,
      };
      await expect(
        telemetry.record(userId, {buckets: [desktop]}, otherDeviceId),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(
        await telemetry.record(userId, {buckets: [desktop]}, deviceId),
      ).toEqual({saved: 1});
      expect(
        (await telemetry.list(userId, {source: 'desktop'})).items[0].deviceId,
      ).toBe(deviceId);
      await expect(
        workstates.capture(userId, {...capture(), deviceId}),
      ).rejects.toBeInstanceOf(BadRequestException);
      const revoked = await devices.register(userId, {
        name: 'Revoked',
        platform: 'windows',
      });
      await devices.remove(userId, revoked.id);
      await expect(
        devices.authenticate(`Device ${revoked.token}`),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('sanitizes before encryption, reapplies private words on reads and returns declarative plans', async () => {
      await db
        .insert(activitySettings)
        .values({userId, privateWords: ['bank']});
      const input = capture('bank account');
      input.capture.windowTitle = 'password=bad';
      input.capture.browserUrls.push('https://example.com/bank');
      const state = await workstates.capture(userId, input);
      expect(state.capture.note).toBeUndefined();
      expect(state.capture.windowTitle).toBeUndefined();
      expect(state.capture.browserUrls).toEqual(['https://example.com/docs']);
      const raw = await pool.query(
        'SELECT capture FROM activity_workstates WHERE user_id = $1',
        [userId],
      );
      expect(raw.rows[0].capture).toMatch(/^enc:v1:/);
      expect(raw.rows[0].capture).not.toContain('dashboard');
      const [stored] = await db
        .select()
        .from(activityWorkstates)
        .where(eq(activityWorkstates.userId, userId));
      expect(stored.capture).not.toContain('password');
      expect(stored.capture).not.toContain('bank');
      const plan = await workstates.restore(userId, input.id);
      expect(workstateRestorePlanSchema.parse(plan)).toEqual(plan);
      expect(plan.actions).toContainEqual({
        kind: 'reference',
        field: 'gitBranch',
        text: 'feature/context',
      });
      const sample = bucket();
      sample.page = {url: 'https://example.com/bank'};
      await telemetry.record(userId, {buckets: [sample, bucket()]});
      expect(
        (await telemetry.list(userId, {})).items.find(
          item => item.id === sample.id,
        )?.page,
      ).toBeUndefined();
      await db
        .update(activitySettings)
        .set({privateWords: ['example', 'dashboard']})
        .where(eq(activitySettings.userId, userId));
      expect(
        (await workstates.get(userId, input.id)).capture.browserUrls,
      ).toEqual([]);
      expect(
        (await workstates.get(userId, input.id)).capture.projectPath,
      ).toBeUndefined();
      expect(
        (await telemetry.list(userId, {})).items.every(item => !item.page),
      ).toBe(true);
    });

    it('isolates workstate lookup, restore, search, retries and deletion by owner', async () => {
      const input = capture();
      const states = await Promise.all([
        workstates.capture(userId, input),
        workstates.capture(userId, input),
      ]);
      expect(states[0]).toEqual(states[1]);
      const replay = await workstates.capture(userId, {
        ...input,
        capture: {browserUrls: [], note: 'Changed'},
      });
      expect(replay.capture.note).toBe(input.capture.note);
      await expect(
        workstates.get(otherUserId, input.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        workstates.restore(otherUserId, input.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(
        (await workstates.list(otherUserId, {search: 'dashboard'})).items,
      ).toEqual([]);
      await workstates.remove(otherUserId, input.id);
      expect(
        (await workstates.list(userId, {context: 'dashboard', search: 'tests'}))
          .items,
      ).toHaveLength(1);
      expect(
        (await workstates.list(userId, {context: 'missing'})).items,
      ).toEqual([]);
      await workstates.capture(otherUserId, input);
      await workstates.clear(userId);
      expect((await workstates.list(otherUserId, {})).items).toHaveLength(1);
    });

    it('pages deterministically over equal timestamps and bounds encrypted search scans', async () => {
      const instant = at();
      const inputs = [
        capture('first'),
        capture('second'),
        capture('third'),
      ].map(input => ({
        ...input,
        capturedAt: instant,
      }));
      for (const input of inputs) await workstates.capture(userId, input);
      const first = await workstates.list(userId, {
        limit: 2,
        from: instant,
        to: instant,
      });
      expect(first.items).toHaveLength(2);
      const second = await workstates.list(userId, {
        limit: 2,
        ...first.nextCursor,
      });
      expect(second.items).toHaveLength(1);
      expect(
        new Set([...first.items, ...second.items].map(state => state.id)).size,
      ).toBe(3);
      expect(second.nextCursor).toBeNull();
      const empty = await workstates.list(userId, {
        limit: 1,
        search: 'unmatched',
      });
      expect(empty.items).toEqual([]);
      expect(empty.nextCursor).not.toBeNull();
      const buckets = [bucket(), bucket(), bucket()].map(sample => ({
        ...sample,
        startedAt: instant,
      }));
      await telemetry.record(userId, {buckets});
      const page = await telemetry.list(userId, {
        limit: 2,
        from: instant,
        to: instant,
      });
      const next = await telemetry.list(userId, {limit: 2, ...page.nextCursor});
      expect(
        new Set([...page.items, ...next.items].map(sample => sample.id)).size,
      ).toBe(3);
    });

    it('hides expired rows, prunes only the owner and does not reinsert stale uploads', async () => {
      const old = new Date(Date.now() - 31 * 86_400_000);
      const state = capture();
      const sample = bucket();
      for (const owner of [userId, otherUserId]) {
        await db.insert(activityWorkstates).values({
          userId: owner,
          id: state.id,
          capturedAt: old,
          capture: JSON.stringify(state.capture),
        });
        await db.insert(telemetryDynamics).values({
          userId: owner,
          id: sample.id,
          source: 'browser',
          startedAt: old,
          endedAt: new Date(old.getTime() + 60_000),
          metrics: {},
        });
      }
      expect((await workstates.list(userId, {})).items).toEqual([]);
      expect((await telemetry.list(userId, {})).items).toEqual([]);
      await expect(workstates.restore(userId, state.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await workstates.deleteOld(userId);
      await telemetry.deleteOld(userId);
      expect(
        await db
          .select()
          .from(activityWorkstates)
          .where(eq(activityWorkstates.userId, userId)),
      ).toHaveLength(0);
      expect(
        await db
          .select()
          .from(activityWorkstates)
          .where(eq(activityWorkstates.userId, otherUserId)),
      ).toHaveLength(1);
      expect(
        await db
          .select()
          .from(telemetryDynamics)
          .where(
            and(
              eq(telemetryDynamics.userId, userId),
              eq(telemetryDynamics.id, sample.id),
            ),
          ),
      ).toHaveLength(0);
      expect(
        await db
          .select()
          .from(telemetryDynamics)
          .where(eq(telemetryDynamics.userId, otherUserId)),
      ).toHaveLength(1);
      expect(
        await telemetry.record(userId, {
          buckets: [
            {
              ...sample,
              startedAt: old.toISOString(),
              endedAt: new Date(old.getTime() + 60_000).toISOString(),
            },
          ],
        }),
      ).toEqual({saved: 0});
    });

    it('summarizes overlapping local-day buckets without metadata, expired rows or other owners', async () => {
      vi.useFakeTimers({toFake: ['Date']});
      vi.setSystemTime(new Date('2025-04-01T12:00:00Z'));
      try {
        const timeZone = vi.fn().mockResolvedValue('Europe/Warsaw');
        const summaries = new TelemetrySummaryService(
          db as never,
          {timeZone} as unknown as ActivityService,
        );
        const sample = {
          id: randomUUID(),
          source: 'desktop' as const,
          deviceId,
          startedAt: new Date('2025-03-29T22:59:00Z'),
          endedAt: new Date('2025-03-29T23:01:00Z'),
          metrics: {
            inputCount: 12,
            terminalCommands: 10,
            terminalFailures: 2,
            focusSeconds: 120,
          },
        };
        await db.insert(telemetryDynamics).values([
          {...sample, userId},
          {
            ...sample,
            userId: otherUserId,
            deviceId: otherDeviceId,
            metrics: {inputCount: 999},
          },
          {
            ...sample,
            userId,
            id: randomUUID(),
            deviceId: null,
            source: 'browser',
            metrics: {readingSeconds: 60},
            page: JSON.stringify({
              url: 'https://example.com/docs',
              title: 'Private context',
            }),
          },
          {
            ...sample,
            userId,
            id: randomUUID(),
            startedAt: new Date('2025-02-01T12:00:00Z'),
            endedAt: new Date('2025-02-01T12:01:00Z'),
            metrics: {inputCount: 999},
          },
          {
            ...sample,
            userId,
            id: randomUUID(),
            startedAt: new Date('2025-03-30T22:00:00Z'),
            endedAt: new Date('2025-03-30T22:01:00Z'),
            metrics: {inputCount: 999},
          },
        ]);
        const result = await summaries.summarize(userId, {
          from: '2025-03-30',
          to: '2025-03-30',
        });
        expect(timeZone).toHaveBeenCalledWith(userId);
        expect(result.find(metric => metric.name === 'inputCount')?.value).toBe(
          6,
        );
        expect(
          result.find(metric => metric.name === 'terminalErrorPercent')?.value,
        ).toBe(20);
        expect(
          result.find(metric => metric.name === 'readingHours')?.value,
        ).toBeCloseTo(30 / 3600);
        expect(JSON.stringify(result)).not.toMatch(
          /example|Private context|page|deviceId/,
        );
        expect(
          (
            await summaries.summarize(userId, {
              from: '2025-03-30',
              to: '2025-03-30',
              deviceId,
            })
          ).every(metric => metric.source === 'desktop'),
        ).toBe(true);
        expect(
          await summaries.summarize(userId, {
            from: '2025-03-30',
            to: '2025-03-30',
            deviceId: otherDeviceId,
          }),
        ).toEqual([]);
        expect(
          await summaries.summarize(userId, {
            from: '2025-02-01',
            to: '2025-02-01',
          }),
        ).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });

    it('pages all equal-time measurements and preserves missing days and explicit zeros', async () => {
      vi.useFakeTimers({toFake: ['Date']});
      vi.setSystemTime(new Date('2025-04-01T12:00:00Z'));
      try {
        const summaries = new TelemetrySummaryService(
          db as never,
          {timeZone: async () => 'UTC'} as unknown as ActivityService,
        );
        const sample = {
          userId,
          source: 'browser' as const,
          startedAt: new Date('2025-03-29T12:00:00Z'),
          endedAt: new Date('2025-03-29T12:01:00Z'),
          metrics: {inputCount: 1},
        };
        await db
          .insert(telemetryDynamics)
          .values(
            Array.from({length: 1001}, () => ({...sample, id: randomUUID()})),
          );
        await db.insert(telemetryDynamics).values({
          ...sample,
          id: randomUUID(),
          startedAt: new Date('2025-03-31T12:00:00Z'),
          endedAt: new Date('2025-03-31T12:01:00Z'),
          metrics: {inputCount: 0},
        });
        const metrics = telemetryDailyMetrics(
          await summaries.summarize(userId, {
            from: '2025-03-29',
            to: '2025-03-31',
          }),
        );
        expect(
          metrics.find(metric => metric.key.endsWith('.inputCount'))?.days,
        ).toEqual([
          {day: '2025-03-29', value: 1001},
          {day: '2025-03-31', value: 0},
        ]);
        expect(
          metrics.find(metric => metric.key.endsWith('.inputPerMinute'))?.days,
        ).toEqual([
          {day: '2025-03-29', value: 1},
          {day: '2025-03-31', value: 0},
        ]);
      } finally {
        vi.useRealTimers();
      }
    });
  },
);
