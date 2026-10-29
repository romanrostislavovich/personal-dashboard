import { BandIngest } from '@pd/contracts';
import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { BandDaysService } from './band-days.service';
import { BandService } from './band.service';
import { WearableService } from './wearable.service';

/** Runs against the generated migrations, like the other *.db.spec.ts. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../../apps/api/migrations');
const DB_NAME = `health_band_test_${process.pid}`;

const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
const FROM = Date.parse('2026-10-28T20:00:00Z');
const TO = Date.parse('2026-10-29T12:00:00Z');
const SLEEP_START = Date.parse('2026-10-28T22:00:00Z');
const SLEEP_END = Date.parse('2026-10-29T05:00:00Z');
const REACTION = Date.parse('2026-10-29T09:00:00Z');

/**
 * A night of 7 hours at 52 bpm, then a morning at rest at 62 with a walk at 07:00 and a
 * reaction at 09:00 (90 bpm for 7 minutes, still).
 */
function upload(withReaction = true): BandIngest {
  const minutes: BandIngest['minutes'] = [];
  for (let at = FROM; at < TO; at += MIN) {
    const asleep = at >= SLEEP_START && at < SLEEP_END;
    const walking =
      at >= Date.parse('2026-10-29T07:00:00Z') && at < Date.parse('2026-10-29T07:20:00Z');
    const reacting = withReaction && at >= REACTION && at < REACTION + 7 * MIN;
    const bpm = asleep ? 52 : walking ? 100 : reacting ? 90 : 62;
    minutes.push({ at: iso(at), bpm, bpmMin: bpm, bpmMax: bpm + 2, steps: walking ? 90 : 0 });
  }
  return {
    from: iso(FROM),
    to: iso(TO),
    minutes,
    hours: [
      { at: '2026-10-29T07:00:00.000Z', steps: 1800, calories: 120, distanceM: 1400, floors: 1 },
    ],
    points: [{ kind: 'hrv', at: '2026-10-29T04:00:00.000Z', value: 38 }],
    sessions: [
      {
        kind: 'sleep',
        startAt: iso(SLEEP_START),
        endAt: iso(SLEEP_END),
        type: null,
        title: null,
        stages: [
          { startAt: iso(SLEEP_START), endAt: iso(SLEEP_START + 120 * MIN), stage: 'light' },
          {
            startAt: iso(SLEEP_START + 120 * MIN),
            endAt: iso(SLEEP_START + 210 * MIN),
            stage: 'deep',
          },
          {
            startAt: iso(SLEEP_START + 210 * MIN),
            endAt: iso(SLEEP_START + 220 * MIN),
            stage: 'awake',
          },
          { startAt: iso(SLEEP_START + 220 * MIN), endAt: iso(SLEEP_END), stage: 'rem' },
        ],
      },
    ],
  };
}

describe.skipIf(!ADMIN_URL)('the band through the phone', { timeout: 60_000 }, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let band: BandService;
  let wearable: WearableService;
  const send = vi.fn();
  const userId = randomUUID();
  const device = { id: randomUUID(), userId };

  beforeAll(async () => {
    admin = new Pool({ connectionString: ADMIN_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DB_NAME}`;
    pool = new Pool({ connectionString: url.toString() });
    pool.on('error', () => undefined);
    db = drizzle({ client: pool, casing: 'snake_case' });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale, time_zone)
      VALUES (${userId}, 'band@test', 'hash', 'Test', 'en', 'Europe/Warsaw')`);
    // A week of baseline: resting 60, HRV 40.
    for (let d = 20; d <= 27; d++) {
      await db.execute(sql`INSERT INTO health_band_days (user_id, day, resting_heart_rate, hrv_ms, sleep_minutes)
        VALUES (${userId}, ${`2026-10-${d}`}, ${59 + (d % 3)}, ${39 + (d % 3)}, 420)`);
    }
    const keys = { get: async () => null, isOwner: async () => false };
    wearable = new WearableService(
      { get: () => 'https://dash.test' } as never,
      db as never,
      {} as never,
      keys as never,
    );
    const users = {
      findById: async () => ({ id: userId, locale: 'en', timeZone: 'Europe/Warsaw' }),
      timeZoneOf: (user: { timeZone: string }) => user.timeZone,
    };
    const days = new BandDaysService(db as never, users as never, wearable);
    band = new BandService(
      db as never,
      days,
      { send } as never,
      { registerAction: () => undefined } as never,
    );
  }, 60_000);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-29T10:00:00Z'));
    send.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin?.end();
  });

  const count = async (table: string) =>
    Number(
      (await db.execute<{ n: string }>(sql.raw(`SELECT count(*) AS n FROM ${table}`))).rows[0].n,
    );

  it('counts the day from the upload and tells about the reaction once', async () => {
    await band.ingest(device, upload());
    const [day] = await wearable.days(userId, { from: '2026-10-29', to: '2026-10-29' });
    expect(day).toMatchObject({
      restingHeartRate: 52,
      hrvMs: 38,
      sleepMinutes: 410,
      deepMinutes: 90,
      awakeMinutes: 10,
      sleepStart: '23:00',
      sleepEnd: '06:00',
      steps: 1800,
      reactions: 1,
    });
    expect(day.sleepScore).toBeGreaterThan(70);
    expect(day.stressScore).not.toBeNull();
    expect(day.resilience).not.toBeNull();

    expect(send).toHaveBeenCalledTimes(1);
    const [, notification] = send.mock.calls[0];
    expect(notification).toMatchObject({ now: true, link: '/health/band?day=2026-10-29' });
    expect(notification.actions).toHaveLength(6);

    const detail = await band.day(userId, '2026-10-29');
    expect(detail.reactions).toHaveLength(1);
    // Against the morning's own pulse at rest: no day before told one.
    expect(detail.reactions[0]).toMatchObject({ peakBpm: 90, baselineBpm: 62 });
    expect(detail.sleep?.stages).toHaveLength(4);
    expect(detail.hours.some((h) => h.stress !== null)).toBe(true);
    expect(detail.baseline.restingHeartRate).toBe(60);
  });

  it('replaces the window when it comes again, keeping the reaction and its notification', async () => {
    const minutes = await count('health_band_minutes');
    const [before] = (await band.day(userId, '2026-10-29')).reactions;
    await band.ingest(device, upload());
    expect(await count('health_band_minutes')).toBe(minutes);
    expect(await count('health_band_sessions')).toBe(1);
    const [after] = (await band.day(userId, '2026-10-29')).reactions;
    expect(after.id).toBe(before.id);
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps a reaction the owner answered, even when it is no longer found', async () => {
    const [reaction] = (await band.day(userId, '2026-10-29')).reactions;
    await band.setFeeling(userId, reaction.id, 'anxious');
    await band.ingest(device, upload(false));
    const kept = (await band.day(userId, '2026-10-29')).reactions;
    expect(kept).toEqual([expect.objectContaining({ id: reaction.id, feeling: 'anxious' })]);
  });

  it('adds a breathing session to the day’s mindfulness', async () => {
    await band.addMindfulness(userId, { startAt: '2026-10-29T08:00:00.000Z', minutes: 5 });
    const [day] = await wearable.days(userId, { from: '2026-10-29', to: '2026-10-29' });
    expect(day.mindfulnessMinutes).toBe(5);
    // The phone's next window does not take it away.
    await band.ingest(device, upload(false));
    const detail = await band.day(userId, '2026-10-29');
    expect(detail.mindfulness).toHaveLength(1);
    await band.removeMindfulness(userId, detail.mindfulness[0].id);
    const [after] = await wearable.days(userId, { from: '2026-10-29', to: '2026-10-29' });
    expect(after.mindfulnessMinutes).toBeNull();
  });
});
