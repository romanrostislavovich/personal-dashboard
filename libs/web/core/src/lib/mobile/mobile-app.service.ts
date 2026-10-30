import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {Router} from '@angular/router';
import {App} from '@capacitor/app';
import {appsApi} from '@pd/client-core';
import {AuthService} from '../auth/auth.service';
import {DASHBOARD_CLIENT} from '../client/dashboard-client';
import {
  applyPendingBundle,
  fetchNewerBundle,
  removeOldBundles,
} from './interface-update';
import {installId, isMobileApp, mobileServer, phoneModel} from './mobile-app';
import {MobilePushService} from './mobile-push.service';
import {prefetchForOffline} from './offline-prefetch';
import {ShareInbox} from './share-inbox';
import {onShared, takeShared} from './share-target';

/** Not in the middle of the start. */
const FIRST_CHECK_MS = 20_000;
/** A deploy reaches the phone within this, at the next start, or on coming back to the app. */
const CHECK_EVERY_MS = 2 * 60 * 60_000;
/** Coming back to the app asks for a newer interface, but not on every switch of apps. */
const UPDATE_ON_RESUME_MS = 5 * 60_000;
/** Coming back to the app reads ahead again, but not on every switch of apps. */
const PREFETCH_ON_RESUME_MS = 60 * 60_000;

/**
 * What the Android app does besides showing the interface: the system Back button goes back in
 * the app, the phone appears in Settings → Apps, and a newer interface from the server replaces
 * the one inside (interface-update.ts), what is needed on the way is read ahead while there
 * is a connection (offline-prefetch.ts), and the phone takes push notifications
 * (mobile-push.service.ts). In a browser and the desktop app it does nothing.
 */
@Injectable({providedIn: 'root'})
export class MobileAppService {
  private readonly auth = inject(AuthService);
  private readonly api = inject(DASHBOARD_CLIENT).api;
  private readonly apps = appsApi(this.api);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly push = inject(MobilePushService);
  private readonly inbox = inject(ShareInbox);
  private started = false;
  private prefetchedAt = 0;
  private updateCheckedAt = 0;

  start(): void {
    if (!isMobileApp() || this.started) {
      return;
    }
    this.started = true;
    // A plugin the APK lacks throws at once, not in a promise: the app starts without it.
    try {
      void App.addListener('backButton', ({canGoBack}) =>
        canGoBack ? history.back() : void App.minimizeApp(),
      ).catch(() => undefined);
      // Out of sight is the time to swap the interface: its reload is not seen.
      void App.addListener(
        'pause',
        () => void applyPendingBundle().catch(() => undefined),
      ).catch(() => undefined);
      void App.addListener('resume', () => {
        if (Date.now() - this.prefetchedAt > PREFETCH_ON_RESUME_MS) {
          void this.prefetch();
        }
        // Unpacked now, shown when the app goes to the background next time.
        if (Date.now() - this.updateCheckedAt > UPDATE_ON_RESUME_MS) {
          void this.checkUpdate();
        }
      }).catch(() => undefined);
      // personaldashboard://psychology/gentle — the widget opens a page of the app.
      void App.addListener('appUrlOpen', ({url}) => {
        const route = url.replace(/^personaldashboard:\/\//, '/');
        if (route !== url) {
          void this.router.navigateByUrl(route);
        }
      }).catch(() => undefined);
      // "Share" from another app: the capture page offers where it goes.
      onShared(() => void this.openShared());
      void this.openShared();
      void removeOldBundles().catch(() => undefined);
    } catch (error) {
      console.error(`The app's native part: ${error}`);
    }
    setTimeout(() => void this.tick(), FIRST_CHECK_MS);
    setInterval(() => void this.tick(), CHECK_EVERY_MS);
  }

  private async openShared(): Promise<void> {
    const content = await takeShared();
    if (content) {
      this.inbox.put(content);
      // Reloaded if it is open already: it takes the new share.
      await this.router.navigateByUrl('/', {skipLocationChange: true});
      await this.router.navigateByUrl('/capture');
    }
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
    await this.checkUpdate();
  }

  private async checkUpdate(): Promise<void> {
    const server = mobileServer();
    if (server) {
      this.updateCheckedAt = Date.now();
      await fetchNewerBundle(server).catch(() => undefined);
    }
  }

  private async prefetch(): Promise<void> {
    if (!this.auth.user() || !navigator.onLine) {
      return;
    }
    this.prefetchedAt = Date.now();
    await prefetchForOffline(this.http, this.api).catch(() => undefined);
  }
}
