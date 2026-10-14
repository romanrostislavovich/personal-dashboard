import { inject, Injectable, signal } from '@angular/core';
import { dataApi } from '@pd/client-core';
import { AuthService } from '../auth/auth.service';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { DeviceBackup, DeviceBackupStatus, desktopBridge } from '../realtime/desktop-bridge';
import { copyDue, copyName } from './backup-schedule';

/** How often the app looks whether a copy is due (a cheap look at a folder). */
const CHECK_EVERY_MS = 3_600_000;
/** Not in the middle of the start. */
const FIRST_CHECK_MS = 60_000;

/**
 * Copies of one's data kept on the device itself — today the desktop app, later the phone:
 * once a day the archive of Settings → Data is fetched and handed to the device, which keeps
 * the last ones in a folder. A server gone, or not paid for, leaves them; they come back
 * through "Import" into any dashboard. The device only stores files (`DeviceBackup`), so a new
 * one needs nothing but its own bridge.
 */
@Injectable({ providedIn: 'root' })
export class DeviceBackupService {
  private readonly auth = inject(AuthService);
  private readonly data = dataApi(inject(DASHBOARD_CLIENT).api);
  /** `null` — this device keeps no copies (a browser tab). */
  readonly device: DeviceBackup | null = desktopBridge()?.backup ?? null;

  readonly status = signal<DeviceBackupStatus | null>(null);
  readonly busy = signal(false);
  /** Why the last copy failed; `null` — it did not. */
  readonly error = signal<string | null>(null);
  private started = false;

  /** Once, at the start of the app: the copy is checked now and then every hour. */
  start(): void {
    if (!this.device || this.started) {
      return;
    }
    this.started = true;
    void this.refresh();
    setTimeout(() => void this.makeIfDue(), FIRST_CHECK_MS);
    setInterval(() => void this.makeIfDue(), CHECK_EVERY_MS);
  }

  async refresh(): Promise<void> {
    if (this.device) {
      this.status.set(await this.device.status());
    }
  }

  /** Fetches the archive and hands it to the device; the day's copy is replaced. */
  async makeNow(): Promise<void> {
    const device = this.device;
    if (!device || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const archive = await this.data.export();
      const bytes = new Uint8Array(await archive.arrayBuffer());
      this.status.set(await device.save(copyName(new Date()), bytes));
      this.error.set(null);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }

  async chooseFolder(): Promise<void> {
    if (this.device) {
      this.status.set(await this.device.chooseFolder());
    }
  }

  async setKeep(keep: number): Promise<void> {
    if (this.device) {
      this.status.set(await this.device.setKeep(keep));
    }
  }

  /** Signed in, and the newest copy is a day old or there is none. */
  private async makeIfDue(): Promise<void> {
    if (!this.device || !this.auth.user()) {
      return;
    }
    await this.refresh();
    if (copyDue(this.status()?.copies[0], new Date())) {
      await this.makeNow();
    }
  }
}
