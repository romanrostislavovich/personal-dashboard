import { inject, Injectable } from '@angular/core';
import { appsApi } from '@pd/client-core';
import { AuthService } from '../auth/auth.service';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { desktopBridge } from '../realtime/desktop-bridge';

/** Not in the middle of the start. */
const FIRST_REPORT_MS = 30_000;
/** The app updates itself every 2 hours: the list of devices follows it closely enough. */
const REPORT_EVERY_MS = 2 * 60 * 60_000;

/** `process.platform` of the desktop app → a word for the list of devices. */
const PLATFORMS: Record<string, string> = { win32: 'windows', darwin: 'macos', linux: 'linux' };

/**
 * The desktop app tells the server it runs on this computer, and which version — for the list
 * of devices in Settings → Apps. Its own process has no session; the page inside it has, so the
 * page reports for it. A browser tab does nothing here.
 */
@Injectable({ providedIn: 'root' })
export class DesktopInstallService {
  private readonly auth = inject(AuthService);
  private readonly apps = appsApi(inject(DASHBOARD_CLIENT).api);
  private started = false;

  start(): void {
    if (!desktopBridge()?.apps || this.started) {
      return;
    }
    this.started = true;
    setTimeout(() => void this.report(), FIRST_REPORT_MS);
    setInterval(() => void this.report(), REPORT_EVERY_MS);
  }

  /** Now (Settings → Apps is opened): the list shows this computer as it is. */
  async report(): Promise<void> {
    const bridge = desktopBridge();
    if (!bridge?.apps || !this.auth.user()) {
      return;
    }
    const info = await bridge.apps.info();
    if (!info.version) {
      return; // Run from the sources: no version the server knows.
    }
    const platform = bridge.activity?.platform ?? '';
    await this.apps
      .report({
        installId: info.installId,
        kind: 'desktop',
        name: bridge.activity?.hostname || 'Desktop',
        platform: PLATFORMS[platform] ?? (platform || 'unknown'),
        version: info.version,
      })
      .catch(() => undefined);
  }
}
