import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { appsApi } from '@pd/client-core';
import { AuthService } from '../auth/auth.service';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { applyPendingBundle, fetchNewerBundle, removeOldBundles } from './interface-update';
import { installId, isMobileApp, mobileServer, phoneModel } from './mobile-app';
import { MobilePushService } from './mobile-push.service';
import { prefetchForOffline } from './offline-prefetch';

/** Not in the middle of the start. */
const FIRST_CHECK_MS = 20_000;
/** A deploy reaches the phone within this, or at the next start. */
const CHECK_EVERY_MS = 2 * 60 * 60_000;
/** Coming back to the app reads ahead again, but not on every switch of apps. */
const PREFETCH_ON_RESUME_MS = 60 * 60_000;

/**
 * What the Android app does besides showing the interface: the system Back button goes back in
 * the app, the phone appears in Settings → Apps, and a newer interface from the server replaces
 * the one inside (interface-update.ts), what is needed on the way is read ahead while there
 * is a connection (offline-prefetch.ts), and the phone takes push notifications
 * (mobile-push.service.ts). In a browser and the desktop app it does nothing.
 */
@Injectable({ providedIn: 'root' })
export class MobileAppService {
  private readonly auth = inject(AuthService);
  private readonly apps = appsApi(inject(DASHBOARD_CLIENT).api);
  private readonly http = inject(HttpClient);
  private readonly push = inject(MobilePushService);
  private started = false;
  private prefetchedAt = 0;

  start(): void {
    if (!isMobileApp() || this.started) {
      return;
    }
    this.started = true;
    // A plugin the APK lacks throws at once, not in a promise: the app starts without it.
    try {
      void App.addListener('backButton', ({ canGoBack }) =>
        canGoBack ? history.back() : void App.minimizeApp(),
      ).catch(() => undefined);
      // Out of sight is the time to swap the interface: its reload is not seen.
      void App.addListener('pause', () => void applyPendingBundle().catch(() => undefined)).catch(
        () => undefined,
      );
      void App.addListener('resume', () => {
        if (Date.now() - this.prefetchedAt > PREFETCH_ON_RESUME_MS) {
          void this.prefetch();
        }
      }).catch(() => undefined);
      void removeOldBundles().catch(() => undefined);
    } catch (error) {
      console.error(`The app's native part: ${error}`);
    }
    setTimeout(() => void this.tick(), FIRST_CHECK_MS);
    setInterval(() => void this.tick(), CHECK_EVERY_MS);
  }

  /** Now (Settings → Apps is opened): the list shows this phone as it is. */
  async report(): Promise<void> {
    if (!isMobileApp() || !this.auth.user()) {
      return;
    }
    const info = await App.getInfo();
    await this.apps
      .report({
        installId: installId(),
        kind: 'mobile',
        name: phoneModel(navigator.userAgent),
        platform: 'android',
        version: info.version,
      })
      .catch(() => undefined);
  }

  private async tick(): Promise<void> {
    await this.report().catch(() => undefined);
    await this.push.sync().catch(() => undefined);
    await this.prefetch();
    const server = mobileServer();
    if (server) {
      await fetchNewerBundle(server).catch(() => undefined);
    }
  }

  private async prefetch(): Promise<void> {
    if (!this.auth.user() || !navigator.onLine) {
      return;
    }
    this.prefetchedAt = Date.now();
    await prefetchForOffline(this.http).catch(() => undefined);
  }
}
