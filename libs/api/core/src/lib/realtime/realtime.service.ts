import { Injectable, MessageEvent } from '@nestjs/common';
import { RealtimeEvent } from '@pd/contracts';
import { interval, map, merge, Observable, Subject } from 'rxjs';

const PING_INTERVAL_MS = 25_000;

/**
 * Live connections of open dashboards (a user may have several: browser tabs, the desktop app).
 * Kept in memory — fine for a single API instance.
 */
@Injectable()
export class RealtimeService {
  private readonly connections = new Map<string, Set<Subject<RealtimeEvent>>>();

  /** The SSE stream of one connection; ends when the client disconnects. */
  stream(userId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const events = new Subject<RealtimeEvent>();
      const userConnections = this.connections.get(userId) ?? new Set();
      userConnections.add(events);
      this.connections.set(userId, userConnections);

      const ping = interval(PING_INTERVAL_MS).pipe(map((): RealtimeEvent => ({ type: 'ping' })));
      const subscription = merge(events, ping)
        .pipe(map((event) => ({ data: event })))
        .subscribe(subscriber);

      return () => {
        subscription.unsubscribe();
        userConnections.delete(events);
        if (userConnections.size === 0) {
          this.connections.delete(userId);
        }
      };
    });
  }

  isConnected(userId: string): boolean {
    return (this.connections.get(userId)?.size ?? 0) > 0;
  }

  emit(userId: string, event: RealtimeEvent): void {
    this.connections.get(userId)?.forEach((connection) => connection.next(event));
  }
}
