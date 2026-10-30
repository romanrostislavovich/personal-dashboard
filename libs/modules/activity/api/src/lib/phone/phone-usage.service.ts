import {Inject, Injectable} from '@nestjs/common';
import {DB, Database, UsersService} from '@pd/api-core';
import {
  LocalDate,
  PhoneUsage,
  PhoneUsageDay,
  PhoneUsageQuery,
} from '@pd/contracts';
import {and, eq, gte, inArray, lt, sql} from 'drizzle-orm';
import {
  activityDevices,
  activitySpans,
  ActivityDeviceRow,
} from '../activity.schema';
import {activityPhoneUnlocks} from './phone-unlocks.schema';

const INSERT_CHUNK = 200;
const PHONES = ['android', 'ios'] as const;

/**
 * How the phone is used: the unlocks it sends, and the time in its apps late at night (from the
 * spans it sends anyway). A night belongs to the evening it began on, like late games: 23:00 to
 * 04:00, counted to the day of 23:00.
 */
@Injectable()
export class PhoneUsageService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  async ingest(device: ActivityDeviceRow, unlocks: string[]): Promise<number> {
    const rows = unlocks.map(at => ({
      userId: device.userId,
      deviceId: device.id,
      at: new Date(at),
    }));
    let saved = 0;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const inserted = await this.db
        .insert(activityPhoneUnlocks)
        .values(rows.slice(i, i + INSERT_CHUNK))
        .onConflictDoNothing()
        .returning({id: activityPhoneUnlocks.id});
      saved += inserted.length;
    }
    return saved;
  }

  async usage(
    userId: string,
    {from, to}: PhoneUsageQuery,
  ): Promise<PhoneUsage> {
    const zone = this.users.timeZoneOf(await this.users.findById(userId));
    const days = new Map<LocalDate, PhoneUsageDay>();
    const dayOf = (day: LocalDate) => {
      let found = days.get(day);
      if (!found) {
        found = {day, unlocks: 0, nightSeconds: 0};
        days.set(day, found);
      }
      return found;
    };

    // The user's own days: from the start of `from` to the end of `to` where they live.
    const start = sql`(${from}::date)::timestamp AT TIME ZONE ${zone}`;
    const end = sql`((${to}::date + 1))::timestamp AT TIME ZONE ${zone}`;
    const u = activityPhoneUnlocks;
    const unlockLocal = sql`(${u.at} AT TIME ZONE ${zone})`;
    const unlockRows = await this.db
      .select({
        day: sql<LocalDate>`to_char(${unlockLocal}, 'YYYY-MM-DD')`,
        hour: sql<number>`extract(hour from ${unlockLocal})::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(u)
      .where(and(eq(u.userId, userId), gte(u.at, start), lt(u.at, end)))
      .groupBy(sql`1`, sql`2`);
    const unlocksByHour = Array.from({length: 24}, () => 0);
    for (const row of unlockRows) {
      dayOf(row.day).unlocks += row.count;
      unlocksByHour[row.hour] += row.count;
    }

    // The night after `to` belongs to `to`: read up to 04:00 of the next day.
    const s = activitySpans;
    const local = sql`(${s.startedAt} AT TIME ZONE ${zone})`;
    const nightEnd = sql`((${to}::date + 1)::timestamp + interval '4 hours') AT TIME ZONE ${zone}`;
    const nightRows = await this.db
      .select({
        day: sql<LocalDate>`to_char(${local} - interval '4 hours', 'YYYY-MM-DD')`,
        seconds: sql<number>`sum(${s.seconds})::int`,
      })
      .from(s)
      .innerJoin(activityDevices, eq(activityDevices.id, s.deviceId))
      .where(
        and(
          eq(s.userId, userId),
          inArray(activityDevices.platform, [...PHONES]),
          gte(
            s.startedAt,
            sql`((${from}::date)::timestamp + interval '23 hours') AT TIME ZONE ${zone}`,
          ),
          lt(s.startedAt, nightEnd),
          sql`(extract(hour from ${local}) >= 23 or extract(hour from ${local}) < 4)`,
        ),
      )
      .groupBy(sql`1`);
    for (const row of nightRows) {
      if (row.day >= from && row.day <= to) {
        dayOf(row.day).nightSeconds += row.seconds;
      }
    }

    const list = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
    return {
      days: list,
      unlocks: list.reduce((sum, day) => sum + day.unlocks, 0),
      nightSeconds: list.reduce((sum, day) => sum + day.nightSeconds, 0),
      unlocksByHour,
    };
  }
}
