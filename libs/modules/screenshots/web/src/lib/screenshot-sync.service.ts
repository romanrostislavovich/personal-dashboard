import {inject, Injectable, signal} from '@angular/core';
import {
  ScreenshotIndex,
  screenshotsApi,
  syncScreenshots,
} from '@pd/client-core';
import {
  AuthService,
  DASHBOARD_CLIENT,
  DesktopScreenshots,
  desktopBridge,
} from '@pd/web-core';

/** How often the folder and the server are compared when nothing tells of a change. */
const EVERY_MS = 2 * 60_000;
/** A burst of changes in the folder (a save, a copy of many files) is one sync. */
const AFTER_CHANGE_MS = 3_000;

/**
 * The sync of the desktop app's folder of screenshots with the server, from the page the app
 * shows: the app only reads and writes files, the page holds the session. What the last sync
 * left each file as is kept in this browser's storage, by the user and the folder.
 */
@Injectable({providedIn: 'root'})
export class ScreenshotSyncService {
  private readonly auth = inject(AuthService);
  private readonly api = screenshotsApi(inject(DASHBOARD_CLIENT).api);
  /** `null` — not the desktop app (or an older one): nothing to sync. */
  readonly folder: DesktopScreenshots | null =
    desktopBridge()?.screenshots ?? null;

  readonly busy = signal(false);
  readonly lastSync = signal<Date | null>(null);
  /** Why the last sync failed; `null` — it did not. */
  readonly error = signal<string | null>(null);
  /** Bumped after each sync that changed something: the page reloads its list. */
  readonly changes = signal(0);

  private started = false;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    if (!this.folder || this.started) {
      return;
    }
    this.started = true;
    this.folder.onChanged(() => this.soon());
    setInterval(() => void this.syncNow(), EVERY_MS);
    this.soon();
  }

  /** One at a time; asked while one runs, another follows it. */
  async syncNow(): Promise<void> {
    const folder = this.folder;
    const userId = this.auth.user()?.id;
    if (!folder || !userId) {
      return;
    }
    if (this.busy()) {
      this.again = true;
      return;
    }
    this.busy.set(true);
    try {
      // By the folder too: another folder starts afresh — its emptiness is not a deletion.
      const place = `${userId}.${(await folder.status()).folder}`;
      const {steps} = await syncScreenshots(
        folder,
        this.api,
        this.index(place),
        index => this.saveIndex(place, index),
      );
      this.lastSync.set(new Date());
      this.error.set(null);
      if (steps) {
        this.changes.update(value => value + 1);
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
    if (this.again) {
      this.again = false;
      void this.syncNow();
    }
  }

  private soon(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => void this.syncNow(), AFTER_CHANGE_MS);
  }

  private index(place: string): ScreenshotIndex {
    try {
      return JSON.parse(
        localStorage.getItem(key(place)) ?? '{}',
      ) as ScreenshotIndex;
    } catch {
      return {};
    }
  }

  private saveIndex(place: string, index: ScreenshotIndex): void {
    try {
      localStorage.setItem(key(place), JSON.stringify(index));
    } catch {
      // A full storage: the next sync compares by the server's list again, nothing is lost.
    }
  }
}

/** The record of the last sync of a user's folder. */
const key = (place: string) => `pd.screenshots.index.${place}`;
