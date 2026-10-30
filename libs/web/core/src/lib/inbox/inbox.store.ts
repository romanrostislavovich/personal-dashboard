import {DestroyRef, inject, Injectable, signal} from '@angular/core';
import {notificationsApi} from '@pd/client-core';
import {InboxAnswerInput, InboxAnswerResult, InboxSummary} from '@pd/contracts';
import {DASHBOARD_CLIENT} from '../client/dashboard-client';
import {RealtimeClient} from '../realtime/realtime.client';

/**
 * The bell's state for the whole app: its numbers, and a version that grows whenever the inbox
 * changes — a notification came, or one was read or answered on any device (the `inbox` event) —
 * so the lists read again.
 */
@Injectable({providedIn: 'root'})
export class InboxStore {
  private readonly api = notificationsApi(inject(DASHBOARD_CLIENT).api);
  private started = false;

  readonly summary = signal<InboxSummary>({unread: 0, waiting: 0});
  /** Read by the lists' resources: they load again when it grows. */
  readonly version = signal(0);

  constructor() {
    const subscription = inject(RealtimeClient).events$.subscribe(event => {
      if (event.type === 'inbox' || event.type === 'notification') {
        this.changed();
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  start(): void {
    if (!this.started) {
      this.started = true;
      void this.refresh();
    }
  }

  async markRead(id: string): Promise<void> {
    await this.api.markRead(id).catch(() => undefined);
    this.changed();
  }

  async markAllRead(): Promise<void> {
    await this.api.markAllRead();
    this.changed();
  }

  async answer(
    id: string,
    input: InboxAnswerInput,
  ): Promise<InboxAnswerResult> {
    const result = await this.api.answer(id, input);
    this.changed();
    return result;
  }

  private changed(): void {
    this.version.update(version => version + 1);
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    try {
      this.summary.set(await this.api.inboxSummary());
    } catch {
      // Offline or signed out: the bell keeps its last numbers.
    }
  }
}

/** "21:05" today, "yesterday, 21:05", "24 Oct, 21:05" — in the user's language. */
export function inboxTime(
  iso: string,
  lang: string,
  yesterday: string,
  now = new Date(),
): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString(lang, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const day = (date: Date) => date.toDateString();
  if (day(at) === day(now)) {
    return time;
  }
  const before = new Date(now);
  before.setDate(now.getDate() - 1);
  if (day(at) === day(before)) {
    return `${yesterday}, ${time}`;
  }
  return `${at.toLocaleDateString(lang, {day: 'numeric', month: 'short'})}, ${time}`;
}
