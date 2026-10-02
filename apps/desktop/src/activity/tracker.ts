import { net, powerMonitor } from 'electron';
import { ActivityStore, TrackerConfig } from './activity-store';
import { Span, SpanBuilder, WindowSample } from './span-builder';
import { WindowWatcher } from './window-watcher';

/** What waits is sent this often. */
const UPLOAD_MS = 60_000;
/** The server takes this many spans at a time (see activityIngestSchema). */
const BATCH = 500;

export interface TrackerStatus {
  /** The system is one the tracker can watch windows on (Windows). */
  supported: boolean;
  /** This computer is registered as a device; `null` — tracking is not enabled here. */
  deviceId: string | null;
  paused: boolean;
  /** Spans recorded and not sent yet. */
  pending: number;
}

/**
 * The activity tracker of the desktop shell: every few seconds it notes which window is in
 * front, turns that into spans of time and sends them to the dashboard — the server the window
 * of the app is connected to, with the token of this device.
 *
 * Nothing is recorded while the tracker is paused, while the user is away (no input for the
 * configured minutes, unless the window is full-screen — a video, a game), for an excluded
 * program, when the screen is locked, and before tracking is enabled in the dashboard.
 */
export class ActivityTracker {
  private readonly store = new ActivityStore();
  private readonly spans = new SpanBuilder();
  private readonly watcher = new WindowWatcher((sample) => this.onSample(sample));
  private locked = false;
  private uploading = false;

  constructor(
    private readonly serverUrl: () => string | null,
    /** Called when the status changes — the tray menu shows it. */
    private readonly onChange: () => void,
  ) {}

  start(): void {
    powerMonitor.on('lock-screen', () => this.setLocked(true));
    powerMonitor.on('unlock-screen', () => this.setLocked(false));
    powerMonitor.on('suspend', () => this.close());
    setInterval(() => void this.upload(), UPLOAD_MS);
    if (this.store.deviceId) {
      this.watcher.start();
    }
  }

  status(): TrackerStatus {
    return {
      supported: WindowWatcher.supported,
      deviceId: this.store.deviceId,
      paused: this.paused,
      pending: this.store.queue.length,
    };
  }

  /** The dashboard registered this computer as a device: tracking begins. */
  enable(device: { id: string; token: string }): void {
    this.store.setDevice(device);
    this.watcher.start();
    this.onChange();
  }

  /** Tracking is switched off on this computer; what was not sent is dropped with it. */
  disable(): void {
    this.watcher.stop();
    this.close();
    this.store.dequeue(this.store.queue.length);
    this.store.setDevice(null);
    this.onChange();
  }

  /** `minutes` — pause for so long; `0` — until resumed; `null` — resume. */
  pause(minutes: number | null): void {
    this.store.setPausedUntil(
      minutes === null ? null : minutes === 0 ? 0 : Date.now() + minutes * 60_000,
    );
    if (minutes !== null) {
      this.close();
    }
    this.onChange();
  }

  /** Before the app quits: the open span is saved and what waits is sent. */
  async stop(): Promise<void> {
    this.watcher.stop();
    this.close();
    await this.upload();
  }

  private get paused(): boolean {
    const until = this.store.pausedUntil;
    if (until === null) {
      return false;
    }
    if (until !== 0 && until <= Date.now()) {
      this.store.setPausedUntil(null);
      return false;
    }
    return true;
  }

  private setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked) {
      this.close();
    }
  }

  private onSample(sample: WindowSample | null): void {
    const now = Date.now();
    const config = this.store.config;
    if (!sample || this.locked || this.paused || isExcluded(sample, config)) {
      this.keep(this.spans.feed(null, now));
      return;
    }
    // No keyboard or mouse for a while means the user went away — at the moment the input
    // stopped. A full-screen window is the exception: a film or a game needs no input.
    const idleMs = powerMonitor.getSystemIdleTime() * 1000;
    if (idleMs >= config.idleMinutes * 60_000 && !sample.fullscreen) {
      this.keep(this.spans.feed(null, now - idleMs));
      return;
    }
    this.keep(this.spans.feed(sample, now));
  }

  private close(): void {
    this.keep(this.spans.flush());
  }

  private keep(span: Span | null): void {
    if (span) {
      this.store.enqueue(span);
      this.onChange();
    }
  }

  /** Sends what waits, oldest first; the answer carries the settings to follow from now on. */
  private async upload(): Promise<void> {
    const server = this.serverUrl();
    const token = this.store.token;
    if (this.uploading || !server || !token) {
      return;
    }
    this.uploading = true;
    try {
      // An empty batch is sent too: it is how a new exclusion or idle time reaches the tracker.
      do {
        const batch = this.store.queue.slice(0, BATCH);
        const response = await net.fetch(new URL('/api/activity/device/spans', server).href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Device ${token}` },
          body: JSON.stringify({ spans: batch }),
        });
        if (response.status === 401) {
          // The device was removed in the dashboard: this computer no longer reports.
          this.disable();
          return;
        }
        if (!response.ok) {
          return;
        }
        const config = (await response.json()) as Partial<TrackerConfig>;
        if (typeof config.idleMinutes === 'number' && Array.isArray(config.excludedApps)) {
          this.store.setConfig({
            idleMinutes: config.idleMinutes,
            excludedApps: config.excludedApps,
          });
        }
        this.store.dequeue(batch.length);
        this.onChange();
      } while (this.store.queue.length >= BATCH);
    } catch {
      // No connection: the spans wait in the store.
    } finally {
      this.uploading = false;
    }
  }
}

function isExcluded(sample: WindowSample, config: TrackerConfig): boolean {
  return config.excludedApps.includes(sample.app.toLowerCase());
}
