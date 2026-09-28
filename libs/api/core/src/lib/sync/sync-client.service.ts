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
  SyncActionRequest,
  SyncActionResponse,
  SyncPullRequest,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
} from '@pd/contracts';
import { hostname } from 'node:os';
import { AppConfig } from '../config/env';
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
@Injectable()
export class SyncClient implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SyncClient.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | null = null;
  private pushing: Promise<number> | null = null;
  private readonly peer: string;

  constructor(
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly sync: SyncService,
    private readonly store: SyncStore,
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

  /** Runs a sync (or waits for the one in progress). Errors end up in the status. */
  syncNow(): Promise<void> {
    this.running ??= this.run().finally(() => (this.running = null));
    return this.running;
  }

  private async run(): Promise<void> {
    try {
      const pulled = await this.pull();
      const pushed = await this.pushOnce();
      await this.sync.setState(SYNC_STATE.lastSyncedAt, new Date().toISOString());
      await this.sync.setState(SYNC_STATE.lastError, null);
      if (pulled || pushed) {
        this.logger.log(`Synced: ${pulled} received, ${pushed} sent`);
      }
    } catch (error) {
      const message = error instanceof SyncError ? error.message : `Sync failed: ${error}`;
      if ((await this.sync.getState(SYNC_STATE.lastError)) !== message) {
        this.logger.warn(message);
      }
      await this.sync.setState(SYNC_STATE.lastError, message);
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

  private async request<Req, Res>(action: 'push' | 'pull' | 'action', body: Req): Promise<Res> {
    const url = new URL(`/api/sync/${action}`, this.config.get('SYNC_SERVER_URL', { infer: true }));
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.get('SYNC_TOKEN', { infer: true })}`,
          'Content-Type': SYNC_CONTENT_TYPE,
        },
        body: new Uint8Array(await encodeSyncBody(body)),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    return (await decodeSyncBody(Buffer.from(await response.arrayBuffer()))) as Res;
  }
}
