import { inject, Injectable } from '@angular/core';
import { writingApi } from '@pd/client-core';
import { WritingConfig } from '@pd/contracts';
import { DASHBOARD_CLIENT, desktopBridge } from '@pd/web-core';

/** The settings are asked again this often (changed on another device). */
const REFRESH_MS = 10 * 60_000;

/**
 * Writing in every program of the computer, from the page the desktop app shows: the app reads
 * the fields of other programs and draws the marks; the page checks their texts with the
 * session it holds, and tells the app the settings.
 */
@Injectable({ providedIn: 'root' })
export class DesktopWritingService {
  private readonly api = writingApi(inject(DASHBOARD_CLIENT).api);
  private readonly desktop = desktopBridge()?.writing ?? null;
  private started = false;

  start(): void {
    const desktop = this.desktop;
    if (!desktop || this.started) {
      return;
    }
    this.started = true;
    desktop.onCheck(async (text) => (await this.api.check({ text })).issues);
    desktop.onIgnore(async (what) => {
      if (what.word) {
        this.apply(await this.api.ignore({ word: what.word }));
      } else if (what.ruleId) {
        this.apply(await this.api.ignore({ ruleId: what.ruleId }));
      }
    });
    desktop.onAccepted?.(async (count) => {
      await this.api.accepted(count);
    });
    void this.refresh();
    setInterval(() => void this.refresh(), REFRESH_MS);
  }

  /** The settings as they are now (saved on the Writing page) go to the app at once. */
  apply(config: WritingConfig): void {
    void this.desktop?.configure({
      enabled: config.enabled && config.canCheck,
      ignoredApps: config.ignoredApps,
    });
  }

  private async refresh(): Promise<void> {
    try {
      this.apply(await this.api.settings());
    } catch {
      // Not reachable now: the app keeps what it was told, and it is asked again later.
    }
  }
}
