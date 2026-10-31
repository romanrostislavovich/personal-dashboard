import {Inject, Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {
  DB,
  Database,
  DeviceIdentity,
  NotificationsService,
  PushService,
  SchedulerService,
  UsersService,
} from '@pd/api-core';
import {PhoneCollected, zonedDateTime} from '@pd/contracts';
import {eq, sql} from 'drizzle-orm';
import {activityMessages} from '../activity.messages';
import {activityPhoneLocations} from '../places/places.schema';
import {activityPhoneCollection} from './phone-collection.schema';
import {judgePhone} from './phone-watchdog';

/**
 * Keeps the phone sending without the owner's help (the owner's choice, 2026-10-30, after a
 * day lost when an update left the phone without its job): the phone tells after each run of
 * its collection; every half an hour a phone gone quiet — the collection, the band, the places —
 * is woken by a silent push that starts it all again (SensorsWorker.revive). Only a silence the
 * waking did not end in a day is told to the owner, once.
 */
@Injectable()
export class PhoneWatchdogService implements OnModuleInit {
  private readonly logger = new Logger(PhoneWatchdogService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly scheduler: SchedulerService,
    private readonly push: PushService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'activity.phone-watchdog',
      cron: '*/30 * * * *',
      quiet: true,
      handler: () => this.watch(),
    });
  }

  /** The phone's word after a run of its collection. */
  async collected(device: DeviceIdentity, body: PhoneCollected): Promise<void> {
    const values = {
      collectedAt: new Date(),
      healthAllowed: body.healthAllowed,
      healthNewestAt: body.healthNewestAt
        ? new Date(body.healthNewestAt)
        : null,
      locationAllowed: body.locationAllowed,
    };
    await this.db
      .insert(activityPhoneCollection)
      .values({deviceId: device.id, userId: device.userId, ...values})
      .onConflictDoUpdate({
        target: activityPhoneCollection.deviceId,
        set: values,
      });
  }

  /** Every half an hour: each phone that told at least once. */
  async watch(now = new Date()): Promise<void> {
    const c = activityPhoneCollection;
    const phones = await this.db
      .select({
        row: c,
        lastFixAt: sql<Date | null>`(SELECT max(${activityPhoneLocations.at})
          FROM ${activityPhoneLocations} WHERE ${activityPhoneLocations.deviceId} = ${c.deviceId})`.mapWith(
          (value: string | Date | null) => (value ? new Date(value) : null),
        ),
      })
      .from(c);
    for (const {row, lastFixAt} of phones) {
      try {
        await this.watchOne(row, lastFixAt, now);
      } catch (error) {
        this.logger.warn(`The phone ${row.deviceId} was not watched: ${error}`);
      }
    }
  }

  private async watchOne(
    row: typeof activityPhoneCollection.$inferSelect,
    lastFixAt: Date | null,
    now: Date,
  ): Promise<void> {
    const verdict = judgePhone({...row, lastFixAt}, now);
    let revivedAt = row.revivedAt;
    if (verdict.revive && (await this.push.wake(row.userId, 'revive')) > 0) {
      revivedAt = now;
    }
    if (verdict.tell.length) {
      const user = await this.users.findById(row.userId);
      const text = activityMessages(user?.locale);
      const zone = this.users.timeZoneOf(user);
      const at = (moment: Date) => {
        const {date, time} = zonedDateTime(moment, zone);
        return `${date.slice(8, 10)}.${date.slice(5, 7)} ${time}`;
      };
      await this.notifications.send(row.userId, {
        title: text.phoneQuietTitle,
        body: verdict.tell
          .map(({stream, since}) => text.phoneQuiet[stream](at(since)))
          .join('\n'),
        source: 'activity',
        link: '/settings?tab=devices',
      });
    }
    if (
      revivedAt !== row.revivedAt ||
      JSON.stringify(verdict.told) !== JSON.stringify(row.told)
    ) {
      await this.db
        .update(activityPhoneCollection)
        .set({revivedAt, told: verdict.told})
        .where(eq(activityPhoneCollection.deviceId, row.deviceId));
    }
  }
}
