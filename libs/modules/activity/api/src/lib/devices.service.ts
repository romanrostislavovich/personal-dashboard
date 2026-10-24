import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import { ActivityDevice, ActivityDeviceCreated, ActivityDeviceInput } from '@pd/contracts';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { activityPhoneNotifications } from './phone-notifications.schema';
import { activityWorkstates, telemetryDynamics } from './activity-context.schema';
import {
  activityDevices,
  ActivityDeviceRow,
  activityFocusSessions,
  activityHealth,
  activityOutages,
  activitySpans,
} from './activity.schema';

/** A device says it is alive with every upload; the row is touched no more often than this. */
const SEEN_EVERY_MS = 5 * 60 * 1000;

const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Trackers: the desktop shell on a computer, later an app on a phone. A device is registered by
 * the signed-in user and from then on reports with a token of its own — it has no session and
 * can do nothing but send activity.
 */
@Injectable()
export class DevicesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<ActivityDevice[]> {
    const rows = await this.db
      .select()
      .from(activityDevices)
      .where(eq(activityDevices.userId, userId))
      .orderBy(asc(activityDevices.createdAt));
    return rows.map(toDevice);
  }

  /** The token is returned once; only its hash is kept. */
  async register(userId: string, input: ActivityDeviceInput): Promise<ActivityDeviceCreated> {
    const token = randomBytes(32).toString('hex');
    const [row] = await this.db
      .insert(activityDevices)
      .values({ userId, ...input, tokenHash: hashOf(token) })
      .returning();
    return { ...toDevice(row), token };
  }

  async rename(userId: string, id: string, name: string): Promise<void> {
    const [row] = await this.db
      .update(activityDevices)
      .set({ name })
      .where(this.owned(userId, id))
      .returning({ id: activityDevices.id });
    if (!row) {
      throw new NotFoundException('Device not found');
    }
  }

  /** Removes the device with everything it recorded; its token stops working. */
  async remove(userId: string, id: string): Promise<void> {
    await this.db.delete(activityDevices).where(this.owned(userId, id));
  }

  /**
   * Hands everything the device recorded to another one, then removes it: the same computer
   * registered twice (removed and switched on again) keeps one history. A row the other device
   * already has at the same moment is dropped (it goes to the trash with the removed device).
   */
  async merge(userId: string, id: string, into: string): Promise<void> {
    if (id === into) {
      throw new BadRequestException('A device cannot be merged into itself');
    }
    await this.db.transaction(async (tx) => {
      const found = await tx
        .select({ id: activityDevices.id })
        .from(activityDevices)
        .where(and(eq(activityDevices.userId, userId), inArray(activityDevices.id, [id, into])));
      if (found.length !== 2) {
        throw new NotFoundException('Device not found');
      }
      // Kept per device and moment: a row the other device has at the same moment would clash.
      await tx.execute(sql`
        DELETE FROM activity_spans a USING activity_spans b
        WHERE a.device_id = ${id} AND b.device_id = ${into} AND a.started_at = b.started_at
      `);
      await tx.execute(sql`
        DELETE FROM activity_health a USING activity_health b
        WHERE a.device_id = ${id} AND b.device_id = ${into} AND a.at = b.at
      `);
      await tx.execute(sql`
        DELETE FROM activity_phone_notifications a USING activity_phone_notifications b
        WHERE a.device_id = ${id} AND b.device_id = ${into}
          AND a.app = b.app AND a.posted_at = b.posted_at
      `);
      for (const table of [
        activitySpans,
        activityHealth,
        activityFocusSessions,
        activityOutages,
        telemetryDynamics,
        activityWorkstates,
        activityPhoneNotifications,
      ]) {
        await tx
          .update(table)
          .set({ deviceId: into })
          .where(and(eq(table.userId, userId), eq(table.deviceId, id)));
      }
      await tx.delete(activityDevices).where(this.owned(userId, id));
    });
  }

  /** The device behind the `Authorization: Device <token>` header of a tracker's request. */
  async authenticate(authorization: string | undefined): Promise<ActivityDeviceRow> {
    const token = authorization?.match(/^Device\s+([a-f0-9]{64})$/i)?.[1];
    const [device] = token
      ? await this.db
          .select()
          .from(activityDevices)
          .where(eq(activityDevices.tokenHash, hashOf(token.toLowerCase())))
      : [];
    if (!device) {
      throw new UnauthorizedException('Unknown device');
    }
    // Uploads come every minute: the row changes (and travels through the sync between
    // instances) only now and then.
    await this.db
      .update(activityDevices)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(activityDevices.id, device.id),
          sql`(${activityDevices.lastSeenAt} IS NULL OR ${activityDevices.lastSeenAt} < now() - make_interval(secs => ${SEEN_EVERY_MS / 1000}))`,
        ),
      );
    return device;
  }

  private owned(userId: string, id: string) {
    return and(eq(activityDevices.id, id), eq(activityDevices.userId, userId));
  }
}

function toDevice(row: ActivityDeviceRow): ActivityDevice {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
