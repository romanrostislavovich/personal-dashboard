import {Inject, Injectable} from '@nestjs/common';
import {DB, Database, UsersService} from '@pd/api-core';
import {
  LocalDate,
  PhoneNotificationInput,
  PhoneNotificationsQuery,
  PhoneNotificationsSummary,
} from '@pd/contracts';
import {and, desc, eq, gte, lt, sql} from 'drizzle-orm';
import {ActivityDeviceRow} from './activity.schema';
import {activityPhoneNotifications} from './phone-notifications.schema';

/** Notifications with their text in the summary. */
const LATEST = 30;
const INSERT_CHUNK = 200;

/**
 * The notifications of other apps on the user's phone (sent by the Android app): written down,
 * and summed up for Activity → Phone — which apps interrupt, in which hours, how many.
 */
@Injectable()
export class PhoneNotificationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  async ingest(
    device: ActivityDeviceRow,
    items: PhoneNotificationInput[],
  ): Promise<number> {
    const rows = items.map(item => ({
      userId: device.userId,
      deviceId: device.id,
      app: item.app,
      appName: item.appName || item.app,
      title: item.title,
      text: item.text,
      postedAt: new Date(item.postedAt),
    }));
    let saved = 0;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const inserted = await this.db
        .insert(activityPhoneNotifications)
        .values(rows.slice(i, i + INSERT_CHUNK))
        .onConflictDoNothing()
        .returning({id: activityPhoneNotifications.id});
      saved += inserted.length;
    }
    return saved;
  }

  async summary(
    userId: string,
    {from, to}: PhoneNotificationsQuery,
  ): Promise<PhoneNotificationsSummary> {
    const zone = this.users.timeZoneOf(await this.users.findById(userId));
    // The user's own days: from the start of `from` to the end of `to` where they live.
    const start = sql`(${from}::date)::timestamp AT TIME ZONE ${zone}`;
    const end = sql`((${to}::date + 1))::timestamp AT TIME ZONE ${zone}`;
    const where = and(
      eq(activityPhoneNotifications.userId, userId),
      gte(activityPhoneNotifications.postedAt, start),
      lt(activityPhoneNotifications.postedAt, end),
    );
    const local = sql`${activityPhoneNotifications.postedAt} AT TIME ZONE ${zone}`;

    const byApp = await this.db
      .select({
        app: activityPhoneNotifications.app,
        appName: sql<string>`max(${activityPhoneNotifications.appName})`,
        count: sql<number>`count(*)::int`,
      })
      .from(activityPhoneNotifications)
      .where(where)
      .groupBy(activityPhoneNotifications.app)
      .orderBy(desc(sql`count(*)`));
    const hours = await this.db
      .select({
        hour: sql<number>`extract(hour from ${local})::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(activityPhoneNotifications)
      .where(where)
      .groupBy(sql`1`);
    const days = await this.db
      .select({
        day: sql<LocalDate>`to_char(${local}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(activityPhoneNotifications)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`);
    // Read through Drizzle's columns: the title and the text are decrypted on the way.
    const latest = await this.db
      .select()
      .from(activityPhoneNotifications)
      .where(where)
      .orderBy(desc(activityPhoneNotifications.postedAt))
      .limit(LATEST);

    const byHour = Array.from({length: 24}, () => 0);
    hours.forEach(row => (byHour[row.hour] = row.count));
    return {
      total: byApp.reduce((sum, row) => sum + row.count, 0),
      byApp,
      byHour,
      byDay: days,
      latest: latest.map(row => ({
        app: row.app,
        appName: row.appName,
        title: row.title,
        text: row.text,
        postedAt: row.postedAt.toISOString(),
      })),
    };
  }
}
