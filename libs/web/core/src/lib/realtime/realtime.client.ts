import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { RealtimeEvent } from '@pd/contracts';
import { Subject } from 'rxjs';
import { AuthService } from '../auth/auth.service';

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;

/**
 * Live events from the server (`GET /api/events`, Server-Sent Events).
 * Read with `fetch`, not EventSource, because the stream needs the auth header.
 * Reconnects with a growing pause; stops when the user logs out.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeClient {
  private readonly auth = inject(AuthService);
  private readonly eventsSubject = new Subject<RealtimeEvent>();
  private abort: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_MIN_MS;

  readonly events$ = this.eventsSubject.asObservable();
  /** Grows on every batch of new achievements — for views that should refresh. */
  readonly achievementUnlocks = signal(0);

  constructor() {
    // (Re)connect whenever the token changes; disconnect on logout.
    effect(() => {
      const token = this.auth.token();
      this.disconnect();
      if (token) {
        this.retryDelay = RETRY_MIN_MS;
        void this.connect(token);
      }
    });
    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  private async connect(token: string): Promise<void> {
    const abort = new AbortController();
    this.abort = abort;
    try {
      const response = await fetch('/api/events', {
        headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
        signal: abort.signal,
      });
      if (response.status === 401) {
        return; // The session is over; AuthService handles it on the next API call.
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
      this.scheduleRetry(token);
    }
  }

  /** SSE: events are separated by a blank line, the payload is in `data:` lines. */
  private async read(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      let separator = buffer.indexOf('\n\n');
      while (separator !== -1) {
        this.handle(buffer.slice(0, separator));
        buffer = buffer.slice(separator + 2);
        separator = buffer.indexOf('\n\n');
      }
    }
  }

  private handle(block: string): void {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (!data) {
      return;
    }
    const event = JSON.parse(data) as RealtimeEvent;
    if (event.type === 'ping') {
      return;
    }
    if (event.type === 'achievements') {
      this.achievementUnlocks.update((count) => count + 1);
    }
    this.eventsSubject.next(event);
  }

  private scheduleRetry(token: string): void {
    this.retryTimer = setTimeout(() => void this.connect(token), this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
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
