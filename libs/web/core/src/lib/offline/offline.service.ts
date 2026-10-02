import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../auth/auth.service';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { ToastService } from '../toast/toast.service';

/** While something waits to be sent, the server is tried this often. */
const RETRY_MS = 60_000;
/** A new version of the app is looked for this often while the app stays open. */
const UPDATE_CHECK_MS = 30 * 60_000;

/**
 * The installed app (PWA) without a connection, and its updates.
 *
 * - Pages and the data seen before come from the service worker's cache (ngsw-config.json).
 * - Changes of the user's own records wait in the outbox of the client core and are sent when
 *   the server answers again; this service tells the user about both moments.
 * - A new version downloaded by the service worker is offered with a "Reload" button.
 */
@Injectable({ providedIn: 'root' })
export class OfflineService {
  private readonly client = inject(DASHBOARD_CLIENT);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  private readonly updates = inject(SwUpdate);
  private readonly window = inject(DOCUMENT).defaultView;

  /** The device says it has a connection. (The server may still be unreachable.) */
  readonly online = signal(this.window?.navigator.onLine ?? true);
  /** Changes made offline that wait to be sent. */
  readonly pending = signal(0);

  constructor() {
    // What waited since the last launch goes out as soon as the session is back.
    effect(() => {
      if (this.auth.token() && this.pending() > 0) {
        void this.send();
      }
    });
  }

  /** Called once on start (see provideDashboard). */
  start(): void {
    void this.client.outbox.pending().then((count) => this.pending.set(count));
    this.client.outbox.onChange((count) => {
      if (count > this.pending()) {
        this.toast.show({
          icon: 'cloud_off',
          title: this.transloco.translate('core.offline.savedTitle'),
          text: this.transloco.translate('core.offline.savedText'),
        });
      }
      this.pending.set(count);
    });

    this.window?.addEventListener('online', () => {
      this.online.set(true);
      void this.reconnect();
    });
    this.window?.addEventListener('offline', () => this.online.set(false));
    this.window?.setInterval(() => {
      if (this.pending() > 0 || this.auth.offline()) {
        void this.reconnect();
      }
    }, RETRY_MS);
    this.watchUpdates();
  }

  /** The connection may be back: restores the session if it was lost and sends what waited. */
  private async reconnect(): Promise<void> {
    await this.auth.reconnect();
    if (this.auth.token()) {
      await this.send();
    }
  }

  private async send(): Promise<void> {
    const result = await this.client.api.flushOutbox().catch(() => null);
    if (!result) {
      return;
    }
    if (result.sent > 0) {
      this.toast.show({
        icon: 'cloud_done',
        title: this.transloco.translate('core.offline.sentTitle'),
        text: this.transloco.translate('core.offline.sentText', { count: result.sent }),
      });
    }
    if (result.refused.length > 0) {
      this.toast.show({
        icon: 'error',
        title: this.transloco.translate('core.offline.refusedTitle'),
        text: this.transloco.translate('core.offline.refusedText', {
          count: result.refused.length,
        }),
      });
    }
  }

  /** The service worker serves the old version until the page reloads: say when a new one is in. */
  private watchUpdates(): void {
    if (!this.updates.isEnabled) {
      return;
    }
    this.updates.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        this.snackBar
          .open(
            this.transloco.translate('core.offline.updateReady'),
            this.transloco.translate('core.offline.reload'),
          )
          .onAction()
          .subscribe(() => this.window?.location.reload());
      }
    });
    this.window?.setInterval(
      () => void this.updates.checkForUpdate().catch(() => undefined),
      UPDATE_CHECK_MS,
    );
  }
}
