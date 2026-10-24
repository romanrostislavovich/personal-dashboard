import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushDevice, PushDeviceInput, PushStatus } from '@pd/contracts';
import { and, asc, eq } from 'drizzle-orm';
import { AppConfig } from '../../config/env';
import { DB, Database } from '../../database/database.module';
import { ServerKeysService } from '../../server-keys/server-keys.service';
import { UserRow } from '../../users/users.schema';
import { DeliveryError, Notification } from '../notification-channel';
import { FcmClient, parseServiceAccount } from './fcm';
import { PushDeviceRow, pushDevices } from './push.schema';

const KEY = 'push.fcm-service-account';

/**
 * Push notifications on the user's phones (the Android app): the phones that asked for them,
 * the owner's Firebase key, and sending one notification to each phone of a user. PushChannel
 * hands it the notifications like Telegram gets them.
 */
@Injectable()
export class PushService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PushService.name);
  /** Users with a phone: the channel asks on every notification, without the database. */
  private readonly withDevices = new Set<string>();
  /** The client of the key as last read, and the key it was made from. */
  private client: { json: string; fcm: FcmClient; projectId: string } | null = null;
  private keyError: string | null = null;
  private keySet = false;
  /** A sync client sends nothing: the server does, or every phone would get it twice. */
  private readonly isSyncClient: boolean;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) config: AppConfig,
    private readonly keys: ServerKeysService,
  ) {
    this.isSyncClient = config.get('SYNC_MODE', { infer: true }) === 'client';
  }

  /**
   * After every module's start, not in `onModuleInit`: the migrations run in DatabaseModule's
   * own, and on the first start after an update the table may not be there before them.
   */
  async onApplicationBootstrap(): Promise<void> {
    const rows = await this.db.selectDistinct({ userId: pushDevices.userId }).from(pushDevices);
    rows.forEach((row) => this.withDevices.add(row.userId));
    await this.fcm().catch(() => null);
  }

  /** Whether a notification can go to this user's phones now. */
  canSendTo(userId: string): boolean {
    return !this.isSyncClient && this.keySet && this.withDevices.has(userId);
  }

  /** The app on a phone with its (new) token; another user's phone with the id is left alone. */
  async register(userId: string, id: string, input: PushDeviceInput): Promise<void> {
    await this.db
      .insert(pushDevices)
      .values({ id, userId, token: input.token, name: input.name })
      .onConflictDoUpdate({
        target: pushDevices.id,
        set: { token: input.token, name: input.name },
        setWhere: eq(pushDevices.userId, userId),
      });
    this.withDevices.add(userId);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .delete(pushDevices)
      .where(and(eq(pushDevices.id, id), eq(pushDevices.userId, userId)));
    await this.recount(userId);
  }

  async status(userId: string): Promise<PushStatus> {
    const client = await this.fcm().catch(() => null);
    return {
      owner: await this.keys.isOwner(userId),
      keySet: this.keySet,
      projectId: client?.projectId ?? null,
      keyError: this.keyError,
      devices: (await this.devices(userId)).map(toDevice),
    };
  }

  /** The owner's key: checked with Firebase before it is kept. */
  async setKey(json: string): Promise<void> {
    let fcm: FcmClient;
    let projectId: string;
    try {
      const account = parseServiceAccount(json);
      fcm = new FcmClient(account);
      await fcm.verify();
      projectId = account.projectId;
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
    await this.keys.set(KEY, json);
    this.client = { json, fcm, projectId };
    this.keySet = true;
    this.keyError = null;
  }

  async removeKey(): Promise<void> {
    await this.keys.set(KEY, null);
    this.client = null;
    this.keySet = false;
    this.keyError = null;
  }

  /**
   * To every phone of the user. A phone whose token no longer works is forgotten. Throws when
   * none got it: DeliveryError, tried again later unless no phone is left.
   */
  async send(user: UserRow, notification: Notification): Promise<number> {
    const fcm = await this.fcm();
    if (!fcm) {
      throw new DeliveryError('No Firebase key on the server', { permanent: true });
    }
    let sent = 0;
    let failure: unknown = null;
    for (const device of await this.devices(user.id)) {
      try {
        const result = await fcm.fcm.send(device.token, {
          title: notification.title,
          body: notification.body,
          data: { source: notification.source },
        });
        if (result === 'gone') {
          this.logger.log(`A phone of ${user.email} no longer takes notifications: forgotten`);
          await this.remove(user.id, device.id);
          continue;
        }
        sent++;
        await this.db
          .update(pushDevices)
          .set({ lastSentAt: new Date() })
          .where(eq(pushDevices.id, device.id));
      } catch (error) {
        failure = error;
      }
    }
    if (sent > 0) {
      return sent;
    }
    if (failure) {
      if (failure instanceof DeliveryError && /refused the key/.test(failure.message)) {
        this.keyError = failure.message;
      }
      throw failure;
    }
    throw new DeliveryError('No phone takes notifications', { permanent: true });
  }

  private devices(userId: string): Promise<PushDeviceRow[]> {
    return this.db
      .select()
      .from(pushDevices)
      .where(eq(pushDevices.userId, userId))
      .orderBy(asc(pushDevices.createdAt));
  }

  private async recount(userId: string): Promise<void> {
    if ((await this.devices(userId)).length === 0) {
      this.withDevices.delete(userId);
    }
  }

  /**
   * The client of the server's key, made again when the key changed (set on the other instance
   * of a sync, say); `null` — no key.
   */
  private async fcm(): Promise<{ fcm: FcmClient; projectId: string } | null> {
    const json = await this.keys.get(KEY);
    this.keySet = json !== null;
    if (!json) {
      this.client = null;
      return null;
    }
    if (this.client?.json !== json) {
      try {
        const account = parseServiceAccount(json);
        this.client = { json, fcm: new FcmClient(account), projectId: account.projectId };
      } catch (error) {
        this.keyError = error instanceof Error ? error.message : String(error);
        this.keySet = false;
        return null;
      }
    }
    return this.client;
  }
}

function toDevice(row: PushDeviceRow): PushDevice {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    lastSentAt: row.lastSentAt?.toISOString() ?? null,
  };
}
