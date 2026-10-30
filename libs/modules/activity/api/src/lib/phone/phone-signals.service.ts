import {Inject, Injectable} from '@nestjs/common';
import {DB, Database, UsersService} from '@pd/api-core';
import {
  addDays,
  LocalDate,
  parseLocalDate,
  PhoneSignalIngest,
  PhoneSignalsDay,
  PhoneUsageQuery,
  phoneSignalIngestSchema,
  toLocalDate,
  zonedToUtc,
} from '@pd/contracts';
import {and, asc, eq, gte, lt, sql} from 'drizzle-orm';
import {z} from 'zod';
import {ActivityDeviceRow} from '../activity.schema';
import {activityPhoneDaily, activityPhoneSignals} from './phone-signals.schema';
import {DailyValues, DayBounds, Signal, signalsDays} from './signals-day';

const INSERT_CHUNK = 200;
/** Signals read around a period: a rest that began the evening before, a use past midnight. */
const MARGIN_MS = 12 * 3_600_000;

/**
 * The phone's signals (docs/telemetry.md, the phone's collectors 1–10): written down as they
 * come, and read back as the numbers of each day for Activity → Phone and Links.
 */
@Injectable()
export class PhoneSignalsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  async ingest(
    device: ActivityDeviceRow,
    body: z.output<typeof phoneSignalIngestSchema> | PhoneSignalIngest,
  ): Promise<{saved: number}> {
    const rows = body.signals.map(signal => ({
      userId: device.userId,
      deviceId: device.id,
      kind: signal.kind,
      at: new Date(signal.at),
      data: signal.data ? JSON.stringify(signal.data) : null,
    }));
    let saved = 0;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const inserted = await this.db
        .insert(activityPhoneSignals)
        .values(rows.slice(i, i + INSERT_CHUNK))
        .onConflictDoNothing()
        .returning({id: activityPhoneSignals.id});
      saved += inserted.length;
    }
    for (const item of body.daily ?? []) {
      // The phone sends a day's number again as it grows: the latest one stays.
      await this.db
        .insert(activityPhoneDaily)
        .values({
          userId: device.userId,
          deviceId: device.id,
          day: item.day,
          kind: item.kind,
          key: item.key ?? '',
          value: item.value,
        })
        .onConflictDoUpdate({
          target: [
            activityPhoneDaily.deviceId,
            activityPhoneDaily.day,
            activityPhoneDaily.kind,
            activityPhoneDaily.key,
          ],
          set: {value: item.value, updatedAt: new Date()},
        });
    }
    return {saved};
  }

  async days(
    userId: string,
    {from, to}: PhoneUsageQuery,
  ): Promise<PhoneSignalsDay[]> {
    const zone = this.users.timeZoneOf(await this.users.findById(userId));
    const bounds: DayBounds[] = [];
    for (
      let day = from;
      day <= to;
      day = toLocalDate(addDays(parseLocalDate(day), 1))
    ) {
      const next = toLocalDate(addDays(parseLocalDate(day), 1));
      bounds.push({
        day,
        start: zonedToUtc({date: day, time: '00:00'}, zone).getTime(),
        end: zonedToUtc({date: next, time: '00:00'}, zone).getTime(),
      });
    }
    if (!bounds.length) {
      return [];
    }
    const s = activityPhoneSignals;
    // Read through Drizzle's columns: the data is decrypted on the way.
    const rows = await this.db
      .select({kind: s.kind, at: s.at, data: s.data})
      .from(s)
      .where(
        and(
          eq(s.userId, userId),
          gte(s.at, new Date(bounds[0].start - MARGIN_MS)),
          lt(s.at, new Date(bounds[bounds.length - 1].end + MARGIN_MS)),
        ),
      )
      .orderBy(asc(s.at));
    const signals: Signal[] = rows.map(row => ({
      kind: row.kind,
      at: row.at.getTime(),
      data: row.data ? (JSON.parse(row.data) as Record<string, unknown>) : null,
    }));

    const d = activityPhoneDaily;
    const dailyRows = await this.db
      .select({
        day: sql<LocalDate>`to_char(${d.day}, 'YYYY-MM-DD')`,
        kind: d.kind,
        value: sql<number>`sum(${d.value})::float8`,
      })
      .from(d)
      .where(
        and(
          eq(d.userId, userId),
          gte(d.day, from),
          lt(d.day, toLocalDate(addDays(parseLocalDate(to), 1))),
        ),
      )
      .groupBy(sql`1`, d.kind);
    const daily = new Map<LocalDate, DailyValues>();
    for (const row of dailyRows) {
      const values = daily.get(row.day) ?? {};
      if (row.kind === 'steps') {
        values.steps = Math.round(row.value);
      } else if (row.kind === 'mobileBytes') {
        values.mobileBytes = row.value;
      }
      daily.set(row.day, values);
    }
    return signalsDays(bounds, signals, daily);
  }
}
