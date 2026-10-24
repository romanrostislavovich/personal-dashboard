import { inject, Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { appsApi } from '@pd/client-core';
import { AuthService } from '../auth/auth.service';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { applyPendingBundle, fetchNewerBundle, removeOldBundles } from './interface-update';
import { isMobileApp, mobileServer } from './mobile-app';

/** Not in the middle of the start. */
const FIRST_CHECK_MS = 20_000;
/** A deploy reaches the phone within this, or at the next start. */
const CHECK_EVERY_MS = 2 * 60 * 60_000;
/** Where the phone keeps its own id for the list of devices. */
const INSTALL_ID_KEY = 'pd.mobile.installId';

/**
 * What the Android app does besides showing the interface: the system Back button goes back in
 * the app, the phone appears in Settings → Apps, and a newer interface from the server replaces
 * the one inside (interface-update.ts). In a browser and the desktop app it does nothing.
 */
@Injectable({ providedIn: 'root' })
export class MobileAppService {
  private readonly auth = inject(AuthService);
  private readonly apps = appsApi(inject(DASHBOARD_CLIENT).api);
  private started = false;

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
    const server = mobileServer();
    if (server) {
      await fetchNewerBundle(server).catch(() => undefined);
    }
  }
}

function installId(): string {
  let id = localStorage.getItem(INSTALL_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(INSTALL_ID_KEY, id);
  }
  return id;
}

/** `…(Linux; Android 12; Redmi Note 9 Pro Build/…; wv)…` → `Redmi Note 9 Pro`. */
export function phoneModel(userAgent: string): string {
  const model = userAgent.match(/Android [^;)]*; ([^;)]+?)(?: Build\/[^;)]*)?[;)]/)?.[1]?.trim();
  return model && model !== 'K' ? model : 'Android';
}
