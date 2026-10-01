import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ReconcileResult,
  SyncActionRequest,
  SyncActionResponse,
  SyncBackupInfo,
  SyncFingerprintsRequest,
  SyncFingerprintsResponse,
  SyncPullRequest,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
} from '@pd/contracts';
import { hostname } from 'node:os';
import { AppConfig } from '../config/env';
import { coreMessages } from '../i18n/core.messages';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { compareFingerprints } from './reconcile';
import { decodeSyncBody, encodeSyncBody, SYNC_CONTENT_TYPE } from './sync-protocol';
import { SyncStore } from './sync-store';
import { SERVER_ORIGIN, SYNC_STATE, SyncService } from './sync.service';

/** The first sync runs shortly after startup, not in the middle of it. */
const FIRST_SYNC_DELAY_MS = 5_000;
/** A batch with diary photos over a slow connection may take a while. */
const REQUEST_TIMEOUT_MS = 120_000;
/**
 * After a server action, the page waits this long for the result to be pulled. Usually it takes a
 * moment; while a big backlog is being caught up, the result arrives with a later sync instead.
 */
const ACTION_PULL_WAIT_MS = 10_000;
/** Protection against an endless loop if the server keeps saying "there is more". */
const MAX_BATCHES = 10_000;
/**
 * Versions before this one read the change log in text order ("1000" before "19"): when a batch
 * was cut, some rows were never sent. Both logs are walked once more from the start — rows that
 * are already here are skipped, the missing ones arrive. Bump it to recheck again.
 */
const RECHECK_DONE = '2026-09-30';
const RECHECK_PULLING = 'pulling';
/** How often the client compares its data with the server's (row counts and hashes). */
const RECONCILE_EVERY_MS = 6 * 3_600_000;
/** A difference is raised only if a second check this much later sees it again. */
const RECONCILE_CONFIRM_MS = 10 * 60_000;
/** A day's dump over a slow connection. */
const BACKUP_DOWNLOAD_TIMEOUT_MS = 30 * 60_000;

/** A sync error with a message for the settings page. */
class SyncError extends Error {
  constructor(
    message: string,
    /** The server's HTTP status and its own message, when it answered with an error. */
    readonly status?: number,
    readonly serverMessage?: string,
  ) {
    super(message);
  }
}

/**
 * The client side of sync: every SYNC_INTERVAL_SECONDS pulls the server's changes, then pushes
 * local ones. Without a connection it simply tries again later — the instance keeps working.
 */
/** A sync failing for this long is reported as an error. */
const SYNC_FAILING_REPORT_MS = 15 * 60 * 1000;

@Injectable()
export class SyncClient implements OnApplicationBootstrap, OnApplicationShutdown {
  /** Since when syncs keep failing; `null` — the last one worked, `0` — already reported. */
  private failingSince: number | null = null;
  private readonly logger = new Logger(SyncClient.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | null = null;
  private pushing: Promise<number> | null = null;
  private readonly peer: string;

  constructor(
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly sync: SyncService,
    private readonly store: SyncStore,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {
    this.peer = config.get('SYNC_PEER_NAME', { infer: true }) ?? hostname();
  }

  onApplicationBootstrap(): void {
    if (this.sync.mode !== 'client') {
      return;
    }
    const interval = this.config.get('SYNC_INTERVAL_SECONDS', { infer: true }) * 1000;
    const tick = () => void this.syncNow();
    this.timers = [setTimeout(tick, FIRST_SYNC_DELAY_MS), setInterval(tick, interval)];
  }

  onApplicationShutdown(): void {
    this.timers.forEach(clearTimeout);
  }

  /**
   * Sends everything written here so far, without pulling first (a pull may take long while a
   * backlog is caught up). Before a server action: the server must see, say, the account the
   * user has just added.
   */
  async pushFresh(): Promise<void> {
    await this.pushing?.catch(() => 0);
    try {
      await this.pushOnce();
    } catch (error) {
      throw new ServiceUnavailableException(
        `This runs on the server: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /** After a server action: a new sync, waited for ACTION_PULL_WAIT_MS at most. */
  async pullSoon(): Promise<void> {
    const fresh = (async () => {
      await this.running;
      await this.syncNow();
    })();
    await Promise.race([fresh, new Promise((resolve) => setTimeout(resolve, ACTION_PULL_WAIT_MS))]);
  }

  /** Runs a server action for the user (see ServerActions) and returns its result. */
  async runOnServer(
    userId: string,
    action: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const response = await this.request<SyncActionRequest, SyncActionResponse>('action', {
        ...(await this.handshake()),
        userId,
        action,
        args,
      });
      return response.result;
    } catch (error) {
      // "Invalid API token", "not found"…: the user sees the server's answer as it is.
      if (
        error instanceof SyncError &&
        error.status &&
        error.status < 500 &&
        error.status !== 401
      ) {
        throw new HttpException(error.serverMessage ?? error.message, error.status);
      }
      throw new ServiceUnavailableException(
        `This runs on the server: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /** The server's newest dump (see BackupService). */
  async backupInfo(): Promise<SyncBackupInfo> {
    const response = await this.fetchServer('backup', { method: 'GET' });
    return (await response.json()) as SyncBackupInfo;
  }

  /** A dump of the server's, as a stream. */
  async downloadBackup(name: string): Promise<ReadableStream<Uint8Array>> {
    const response = await this.fetchServer(`backup/${encodeURIComponent(name)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(BACKUP_DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.body) {
      throw new SyncError('The server sent an empty backup');
    }
    return response.body;
  }

  /**
   * "Resync everything": both change logs are walked from the start — every row of the server
   * comes here and every row of here goes there. Mends whatever a comparison found different.
   */
  async resyncEverything(): Promise<void> {
    await this.running;
    await this.sync.setState(SYNC_STATE.recheck, null);
    await this.sync.setState(SYNC_STATE.pushAll, 'yes');
    await this.sync.setState(SYNC_STATE.reconcileSuspect, null);
    await this.sync.setState(SYNC_STATE.reconcileDue, null);
    await this.sync.setState(SYNC_STATE.reconcileResult, null);
    await this.syncNow();
  }

  /** Runs a sync (or waits for the one in progress). Errors end up in the status. */
  syncNow(): Promise<void> {
    this.running ??= this.run().finally(() => (this.running = null));
    return this.running;
  }

  private async run(): Promise<void> {
    try {
      const recheck = await this.startRecheck();
      const pulled = await this.pull();
      if (recheck) {
        // Only now: during the pull the push cursor tells which local rows are unsent, and a
        // reset one would turn every local row into a conflict.
        await this.sync.setState(SYNC_STATE.pushCursor, null);
        await this.sync.setState(SYNC_STATE.recheck, RECHECK_DONE);
      }
      const pushed = await this.pushOnce();
      await this.sync.setState(SYNC_STATE.lastSyncedAt, new Date().toISOString());
      await this.sync.setState(SYNC_STATE.lastError, null);
      this.failingSince = null;
      if (pulled || pushed) {
        this.logger.log(`Synced: ${pulled} received, ${pushed} sent`);
      } else {
        // A failed comparison is not a failed sync: it is tried again later.
        await this.reconcileIfDue().catch(async (error) => {
          this.logger.warn(`Comparing the data with the server's failed: ${error}`);
          await this.sync.setState(SYNC_STATE.reconcileDue, later(RECONCILE_CONFIRM_MS));
        });
      }
    } catch (error) {
      const message = error instanceof SyncError ? error.message : `Sync failed: ${error}`;
      if ((await this.sync.getState(SYNC_STATE.lastError)) !== message) {
        this.logger.warn(message);
      }
      await this.sync.setState(SYNC_STATE.lastError, message);
      this.reportIfLasting(message);
    }
  }

  /**
   * A lost connection for a minute is ordinary; a sync that has not worked for a while is
   * reported once as an error — it lands in the system log and is told to the owner.
   */
  private reportIfLasting(message: string): void {
    this.failingSince ??= Date.now();
    if (this.failingSince !== 0 && Date.now() - this.failingSince >= SYNC_FAILING_REPORT_MS) {
      this.logger.error(
        `Sync has not worked for ${SYNC_FAILING_REPORT_MS / 60_000} minutes: ${message}`,
      );
      // Reported: stay quiet until a sync succeeds and it starts failing again.
      this.failingSince = 0;
    }
  }

  /**
   * Starts the one-time recheck (see RECHECK_DONE) or goes on with one cut short by a lost
   * connection — from where it stopped. Returns whether a recheck is running.
   */
  private async startRecheck(): Promise<boolean> {
    const state = await this.sync.getState(SYNC_STATE.recheck);
    if (state === RECHECK_DONE) {
      return false;
    }
    if (state !== RECHECK_PULLING) {
      this.logger.warn('Rechecking the whole change log once: earlier versions could skip rows');
      await this.sync.setState(SYNC_STATE.pullCursor, null);
      await this.sync.setState(SYNC_STATE.recheck, RECHECK_PULLING);
    }
    return true;
  }

  /**
   * Compares the data with the server's (docs/sync.md, "Reconciliation"): a sync bug once lost
   * rows silently. Runs after a sync that moved nothing, so both sides should be equal; a
   * difference is raised only when a second check confirms it.
   */
  private async reconcileIfDue(): Promise<void> {
    const due = await this.sync.getState(SYNC_STATE.reconcileDue);
    if (due && Date.parse(due) > Date.now()) {
      return;
    }
    const server = await this.request<SyncFingerprintsRequest, SyncFingerprintsResponse>(
      'fingerprints',
      await this.handshake(),
    );
    // Rows missing from the change log are logged now: they count as pending below and go
    // out with the next sync, and the comparison waits for that.
    await this.store.trackUntracked();
    const local = await this.store.fingerprints();
    // A change on either side meanwhile makes the comparison meaningless: next sync then.
    const pending = await this.store.pendingCount(await this.sync.getState(SYNC_STATE.pushCursor));
    if (pending > 0 || (await this.pull()) > 0) {
      return;
    }
    const mismatches = compareFingerprints(local, server.tables);
    const tables = mismatches.map((mismatch) => mismatch.table).join(', ');
    const suspect = await this.sync.getState(SYNC_STATE.reconcileSuspect);
    if (mismatches.length && suspect !== tables) {
      await this.sync.setState(SYNC_STATE.reconcileSuspect, tables);
      await this.sync.setState(SYNC_STATE.reconcileDue, later(RECONCILE_CONFIRM_MS));
      return;
    }
    await this.sync.setState(SYNC_STATE.reconcileSuspect, null);
    await this.sync.setState(SYNC_STATE.reconcileDue, later(RECONCILE_EVERY_MS));
    const previous = await this.sync.getState(SYNC_STATE.reconcileResult);
    const result: ReconcileResult = { checkedAt: new Date().toISOString(), mismatches };
    await this.sync.setState(SYNC_STATE.reconcileResult, JSON.stringify(result));
    if (!mismatches.length) {
      return;
    }
    this.logger.warn(`The data differs from the server's: ${tables}`);
    const known = previous ? (JSON.parse(previous) as ReconcileResult).mismatches : [];
    if (known.map((mismatch) => mismatch.table).join(', ') !== tables) {
      await this.notifyOwner(tables);
    }
  }

  private async notifyOwner(tables: string): Promise<void> {
    const owner = await this.users.owner();
    if (owner) {
      const text = coreMessages(owner.locale);
      await this.notifications.send(owner.id, {
        title: text.reconcileTitle,
        body: text.reconcileBody(tables),
        source: 'sync',
      });
    }
  }

  /** One push at a time: a regular sync and a server action may want one together. */
  private pushOnce(): Promise<number> {
    this.pushing ??= this.push().finally(() => (this.pushing = null));
    return this.pushing;
  }

  /** Applies the server's changes; returns how many. */
  private async pull(): Promise<number> {
    let count = 0;
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const cursor = await this.sync.getState(SYNC_STATE.pullCursor);
      const response = await this.request<SyncPullRequest, SyncPullResponse>('pull', {
        ...(await this.handshake()),
        cursor,
      });
      const known = await this.sync.getState(SYNC_STATE.knownServerId);
      if (known !== response.serverId) {
        await this.sync.setState(SYNC_STATE.knownServerId, response.serverId);
        if (known !== null || cursor !== null) {
          // A new server database: download everything and send all local data again.
          this.logger.warn('The server database changed, starting a full sync');
          await this.sync.setState(SYNC_STATE.pullCursor, null);
          await this.sync.setState(SYNC_STATE.pushCursor, null);
          await this.sync.setState(SYNC_STATE.pushAll, 'yes');
          continue;
        }
      }
      await this.store.apply(response.changes, {
        origin: SERVER_ORIGIN,
        unsentAfter: await this.sync.getState(SYNC_STATE.pushCursor),
      });
      count += response.changes.length;
      await this.sync.setState(SYNC_STATE.pullCursor, response.cursor);
      if (!response.hasMore) {
        return count;
      }
    }
    return count;
  }

  /** Sends local changes; returns how many. */
  private async push(): Promise<number> {
    let count = 0;
    // Normally only changes made here: what came from the server does not go back.
    // A new server database gets everything, including what the old one had sent.
    const everything = (await this.sync.getState(SYNC_STATE.pushAll)) !== null;
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const cursor = await this.sync.getState(SYNC_STATE.pushCursor);
      const local = await this.store.changesSince(
        cursor,
        (origin) => everything || origin === null,
      );
      if (local.changes.length) {
        await this.request<SyncPushRequest, SyncPushResponse>('push', {
          ...(await this.handshake()),
          changes: local.changes,
        });
        count += local.changes.length;
      }
      await this.sync.setState(SYNC_STATE.pushCursor, local.cursor);
      if (!local.hasMore) {
        await this.sync.setState(SYNC_STATE.pushAll, null);
        return count;
      }
    }
    return count;
  }

  private async handshake() {
    return { peer: this.peer, ...(await this.sync.handshake()) };
  }

  private async request<Req, Res>(
    action: 'push' | 'pull' | 'action' | 'fingerprints',
    body: Req,
  ): Promise<Res> {
    const response = await this.fetchServer(action, {
      method: 'POST',
      headers: { 'Content-Type': SYNC_CONTENT_TYPE },
      body: new Uint8Array(await encodeSyncBody(body)),
    });
    return (await decodeSyncBody(Buffer.from(await response.arrayBuffer()))) as Res;
  }

  /** A request to `/api/sync/<path>` with SYNC_TOKEN; a failure becomes a SyncError. */
  private async fetchServer(path: string, init: RequestInit): Promise<Response> {
    const url = new URL(`/api/sync/${path}`, this.config.get('SYNC_SERVER_URL', { infer: true }));
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${this.config.get('SYNC_TOKEN', { infer: true })}`,
        },
      });
    } catch {
      throw new SyncError('The server is unreachable — working offline, will retry');
    }
    if (response.status === 401) {
      throw new SyncError('The server rejected SYNC_TOKEN — it must be the same on both sides');
    }
    if (!response.ok) {
      const text = await response.text();
      let message = text;
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        // Not JSON (a proxy error page) — show the text as is.
      }
      throw new SyncError(
        `The server answered ${response.status}: ${message.slice(0, 300)}`,
        response.status,
        message.slice(0, 300),
      );
    }
    return response;
  }
}

/** A time `ms` from now, as sync state keeps it. */
function later(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}
