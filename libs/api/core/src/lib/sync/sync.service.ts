import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SyncMode,
  SyncPullRequest,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  SyncStatus,
} from '@pd/contracts';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config/env';
import { DB, Database } from '../database/database.module';
import { encryptionKeyCheck } from './sync-protocol';
import { syncState } from './sync.schema';
import { SyncStore } from './sync-store';

/** Keys of `sync.state`. */
export const SYNC_STATE = {
  /** Server: id of this database — a new one means clients start over. */
  serverId: 'server-id',
  /** Server: the last contact from a client. */
  lastContact: 'last-contact',
  /** Client: the server database the cursors belong to. */
  knownServerId: 'known-server-id',
  pushCursor: 'push-cursor',
  /** Client: send all rows, not only local changes (after the server database changed). */
  pushAll: 'push-all',
  pullCursor: 'pull-cursor',
  /** Client: progress of the one-time recheck of the whole change log (see SyncClient). */
  recheck: 'recheck',
  lastSyncedAt: 'last-synced-at',
  lastError: 'last-error',
} as const;

/** Origin of changes the client received from the server. */
export const SERVER_ORIGIN = 'server';

/**
 * Two-way sync between two instances (see docs/sync.md): change tracking, the server side of the
 * protocol and the status for the settings page. The client loop is in SyncClient.
 */
@Injectable()
export class SyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SyncService.name);
  readonly mode: SyncMode;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly store: SyncStore,
  ) {
    this.mode = config.get('SYNC_MODE', { infer: true });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.mode === 'off') {
      return;
    }
    await this.store.init();
    this.logger.log(`Sync is on, this instance is the ${this.mode}`);
  }

  /** What both sides must agree on; sent with every request. */
  async handshake(): Promise<{ schema: string; keyCheck: string }> {
    return {
      schema: await this.schemaVersion(),
      keyCheck: encryptionKeyCheck(this.config.get('ENCRYPTION_KEY', { infer: true })),
    };
  }

  // --- Server side ---

  async receive(request: SyncPushRequest): Promise<SyncPushResponse> {
    await this.verify(request);
    const result = await this.store.apply(request.changes, {
      origin: clientOrigin(request.peer),
    });
    await this.touchContact();
    return result;
  }

  async send(request: SyncPullRequest): Promise<SyncPullResponse> {
    await this.verify(request);
    const origin = clientOrigin(request.peer);
    // The client's own changes are not sent back to it.
    const batch = await this.store.changesSince(request.cursor, (from) => from !== origin);
    await this.touchContact();
    return { serverId: await this.serverId(), ...batch };
  }

  /** An action request is checked like push and pull (see ServerActions). */
  async acceptAction(request: { schema: string; keyCheck: string }): Promise<void> {
    await this.verify(request);
    await this.touchContact();
  }

  // --- State and status ---

  async getState(key: string): Promise<string | null> {
    const [row] = await this.db.select().from(syncState).where(eq(syncState.key, key));
    return row?.value ?? null;
  }

  async setState(key: string, value: string | null): Promise<void> {
    if (value === null) {
      await this.db.delete(syncState).where(eq(syncState.key, key));
      return;
    }
    await this.db
      .insert(syncState)
      .values({ key, value })
      .onConflictDoUpdate({ target: syncState.key, set: { value } });
  }

  async status(): Promise<SyncStatus> {
    const client = this.mode === 'client';
    const off = this.mode === 'off';
    return {
      mode: this.mode,
      serverUrl: client ? (this.config.get('SYNC_SERVER_URL', { infer: true }) ?? null) : null,
      lastSyncedAt: off
        ? null
        : await this.getState(client ? SYNC_STATE.lastSyncedAt : SYNC_STATE.lastContact),
      lastError: client ? await this.getState(SYNC_STATE.lastError) : null,
      pendingChanges: client
        ? await this.store.pendingCount(await this.getState(SYNC_STATE.pushCursor))
        : 0,
      ...(off ? { parked: 0, conflicts: 0 } : await this.store.problemCounts()),
    };
  }

  private async verify(request: { schema: string; keyCheck: string }): Promise<void> {
    const own = await this.handshake();
    if (request.schema !== own.schema) {
      throw new ConflictException(
        'The instances run different versions of the dashboard — update both to the same one',
      );
    }
    if (request.keyCheck !== own.keyCheck) {
      throw new ConflictException('ENCRYPTION_KEY differs between the instances');
    }
  }

  private async serverId(): Promise<string> {
    const existing = await this.getState(SYNC_STATE.serverId);
    if (existing) {
      return existing;
    }
    const id = randomUUID();
    await this.setState(SYNC_STATE.serverId, id);
    return id;
  }

  private async touchContact(): Promise<void> {
    await this.setState(SYNC_STATE.lastContact, new Date().toISOString());
  }

  /** The latest applied migration: both instances must be on the same one. */
  private async schemaVersion(): Promise<string> {
    const { rows } = await this.db.execute<{ hash: string }>(
      sql`SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`,
    );
    return rows[0]?.hash ?? 'none';
  }
}

function clientOrigin(peer: string): string {
  return `client:${peer}`;
}
