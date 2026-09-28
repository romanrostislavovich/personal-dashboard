import { Injectable, NotFoundException } from '@nestjs/common';
import { SyncClient } from './sync-client.service';
import { SyncService } from './sync.service';

export type ServerActionHandler = (
  userId: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

/**
 * Actions that reach outside services — refresh from GitHub, import from Last.fm, connect a cost
 * source — run on the server only: a sync client is a copy of the server (docs/sync.md).
 *
 * A module registers its actions in `*.server-actions.ts` and its controllers and AI tools call
 * `run`. On a server (or without sync) that is a plain call. On a client, `run` first pushes local
 * changes (say, the account the user has just added), asks the server to run the action and pulls
 * the result, so the page reads fresh data right after (see `SyncClient.pullSoon`).
 */
@Injectable()
export class ServerActions {
  private readonly handlers = new Map<string, ServerActionHandler>();

  constructor(
    private readonly sync: SyncService,
    private readonly client: SyncClient,
  ) {}

  /** `name` is `<module>.<action>`; `args` must be JSON (they travel to the server). */
  register(name: string, handler: ServerActionHandler): void {
    if (this.handlers.has(name)) {
      throw new Error(`Server action ${name} is registered twice`);
    }
    this.handlers.set(name, handler);
  }

  async run<T = void>(userId: string, name: string, args: object = {}): Promise<T> {
    if (this.sync.mode !== 'client') {
      return (await this.execute(userId, name, { ...args })) as T;
    }
    await this.client.pushFresh();
    const result = await this.client.runOnServer(userId, name, { ...args });
    await this.client.pullSoon();
    return result as T;
  }

  /** The server side of `run` (see SyncController). */
  execute(userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new NotFoundException(`Unknown server action ${name}`);
    }
    return handler(userId, args);
  }
}
