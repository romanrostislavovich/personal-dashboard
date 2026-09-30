import { RealtimeEvent } from '@pd/contracts';
import { ApiClient } from './api-client';
import { API_PATHS } from './core-api';
import { Session } from './session';

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;

type Listener = (event: RealtimeEvent) => void;

/**
 * Live events from the server (`GET /api/events`, Server-Sent Events). Read with `fetch`, not
 * EventSource, because the stream needs the auth header. Follows the session: connects when
 * signed in, reconnects after a drop with a growing pause, disconnects on sign-out.
 */
export class RealtimeConnection {
  private readonly listeners = new Set<Listener>();
  private abort: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_MIN_MS;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly api: ApiClient,
    private readonly session: Session,
    private readonly fetch: typeof globalThis.fetch = (input, init) =>
      globalThis.fetch(input, init),
  ) {}

  /** Starts following the session. */
  start(): void {
    if (this.unsubscribe) {
      return;
    }
    this.unsubscribe = this.session.subscribe(() => this.reconnect());
    this.reconnect();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.disconnect();
  }

  /** Calls `listener` for every event except pings; returns the unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private reconnect(): void {
    this.disconnect();
    if (this.session.isSignedIn) {
      this.retryDelay = RETRY_MIN_MS;
      void this.connect();
    }
  }

  private async connect(): Promise<void> {
    const abort = new AbortController();
    this.abort = abort;
    try {
      const response = await this.fetch(this.api.url(API_PATHS.events), {
        headers: { ...this.api.headers(), Accept: 'text/event-stream' },
        signal: abort.signal,
      });
      if (response.status === 401) {
        return; // The session is over; the next API request ends it.
      }
      if (!response.ok || !response.body) {
        throw new Error(`Events stream failed: ${response.status}`);
      }
      this.retryDelay = RETRY_MIN_MS;
      await this.read(response.body);
    } catch (error) {
      if (abort.signal.aborted) {
        return;
      }
      console.warn('Realtime connection lost', error);
    }
    if (!abort.signal.aborted) {
      this.retryTimer = setTimeout(() => void this.connect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
    }
  }

  private async read(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const parser = new SseParser();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        return;
      }
      for (const event of parser.push(value)) {
        if (event.type !== 'ping') {
          this.listeners.forEach((listener) => listener(event));
        }
      }
    }
  }

  private disconnect(): void {
    this.abort?.abort();
    this.abort = null;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}

/**
 * Server-Sent Events from a byte stream: events are separated by a blank line, the JSON payload
 * is in `data:` lines. Chunks may cut an event (or a character) anywhere.
 */
export class SseParser {
  private readonly decoder = new TextDecoder();
  private buffer = '';

  push(chunk: Uint8Array): RealtimeEvent[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    const events: RealtimeEvent[] = [];
    let separator = this.buffer.indexOf('\n\n');
    while (separator !== -1) {
      const data = this.buffer
        .slice(0, separator)
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      if (data) {
        events.push(JSON.parse(data) as RealtimeEvent);
      }
      this.buffer = this.buffer.slice(separator + 2);
      separator = this.buffer.indexOf('\n\n');
    }
    return events;
  }
}
