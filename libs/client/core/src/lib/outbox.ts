import { KeyValueStore } from './platform';

/** A change made without a connection, waiting to be sent. */
export interface QueuedWrite {
  id: string;
  method: string;
  path: string;
  body?: unknown;
  /** When it was made (ISO). */
  at: string;
}

/** What happened to the queue when it was sent. */
export interface OutboxResult {
  sent: number;
  /** Refused by the server (a 4xx): sending them again would change nothing, so they are dropped. */
  refused: QueuedWrite[];
  /** Still waiting: no connection, or the server is not well. */
  left: number;
}

const STORAGE_KEY = 'pd.outbox';
/** A guard against a queue that never gets through: the oldest changes give way. */
const MAX_QUEUED = 500;

/**
 * Changes that may wait for a connection: the user's own records, where the answer of the server
 * is not needed to go on. Everything that talks to an outside service through the server
 * (connecting an integration, "refresh now"), signing in and the assistant are not here —
 * offline they simply fail.
 */
const QUEUEABLE = [
  /^\/api\/tasks(\/|$)/,
  /^\/api\/diary\/entries\/[^/]+$/,
  /^\/api\/diary\/settings$/,
  /^\/api\/finance\/(transactions|recurring-payments)(\/|$)/,
  /^\/api\/birthdays(\/|$)/,
  /^\/api\/projects(\/|$)/,
];

export function isQueueable(method: string, path: string, body: unknown): boolean {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  return method !== 'GET' && !isForm && QUEUEABLE.some((pattern) => pattern.test(path));
}

/** Sends one queued change; throws `ApiError` for an error status, anything else for no answer. */
export type QueuedSender = (write: QueuedWrite) => Promise<void>;

/**
 * The queue of changes made offline. They are kept in the platform's storage, so closing the
 * app does not lose them, and are sent in the order they were made once there is a connection.
 */
export class Outbox {
  private writes: QueuedWrite[] | null = null;
  private flushing: Promise<OutboxResult> | null = null;
  private readonly listeners = new Set<(pending: number) => void>();

  constructor(private readonly storage: KeyValueStore) {}

  /** Calls `listener` with the number of waiting changes whenever it changes. */
  onChange(listener: (pending: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async pending(): Promise<number> {
    return (await this.load()).length;
  }

  async add(method: string, path: string, body: unknown): Promise<void> {
    const writes = await this.load();
    const write: QueuedWrite = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      method,
      path,
      body,
      at: new Date().toISOString(),
    };
    // A PUT replaces the whole record: of several to the same address only the last matters
    // (the diary saves the entry of the day every few seconds).
    const kept =
      method === 'PUT' ? writes.filter((w) => w.method !== 'PUT' || w.path !== path) : writes;
    await this.save([...kept, write].slice(-MAX_QUEUED));
  }

  /** Sends what is waiting, oldest first, and stops at the first one that gets no answer. */
  flush(send: QueuedSender): Promise<OutboxResult> {
    this.flushing ??= this.run(send).finally(() => (this.flushing = null));
    return this.flushing;
  }

  private async run(send: QueuedSender): Promise<OutboxResult> {
    const result: OutboxResult = { sent: 0, refused: [], left: 0 };
    for (const write of [...(await this.load())]) {
      try {
        await send(write);
        result.sent++;
      } catch (error) {
        const status = (error as { status?: unknown } | null)?.status;
        // No answer or the server's own trouble: this one and the rest wait for the next try.
        if (typeof status !== 'number' || status >= 500 || status === 401) {
          break;
        }
        result.refused.push(write);
      }
      await this.save((await this.load()).filter((w) => w.id !== write.id));
    }
    result.left = (await this.load()).length;
    return result;
  }

  private async load(): Promise<QueuedWrite[]> {
    if (!this.writes) {
      try {
        const text = await this.storage.get(STORAGE_KEY);
        this.writes = text ? (JSON.parse(text) as QueuedWrite[]) : [];
      } catch {
        this.writes = [];
      }
    }
    return this.writes;
  }

  private async save(writes: QueuedWrite[]): Promise<void> {
    this.writes = writes;
    await this.storage.set(STORAGE_KEY, JSON.stringify(writes));
    for (const listener of this.listeners) {
      listener(writes.length);
    }
  }
}
