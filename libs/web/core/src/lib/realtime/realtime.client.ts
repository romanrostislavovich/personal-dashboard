import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { RealtimeEvent } from '@pd/contracts';
import { Subject } from 'rxjs';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';

/**
 * Live events from the server for Angular: the connection of the client core (it follows the
 * session and reconnects by itself) as an observable and a signal.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeClient {
  private readonly eventsSubject = new Subject<RealtimeEvent>();

  readonly events$ = this.eventsSubject.asObservable();
  /** Grows on every batch of new achievements — for views that should refresh. */
  readonly achievementUnlocks = signal(0);

  constructor() {
    const connection = inject(DASHBOARD_CLIENT).realtime;
    const unsubscribe = connection.subscribe((event) => {
      if (event.type === 'achievements') {
        this.achievementUnlocks.update((count) => count + 1);
      }
      this.eventsSubject.next(event);
    });
    connection.start();
    inject(DestroyRef).onDestroy(() => {
      unsubscribe();
      connection.stop();
    });
  }
}
