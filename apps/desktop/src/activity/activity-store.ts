import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Span } from './span-builder';

/** What the server tells the tracker (ActivityDeviceConfig in contracts). */
export interface TrackerConfig {
  idleMinutes: number;
  excludedApps: string[];
  /** Full-screen windows of these count without input, for a while (ActivityDeviceConfig). */
  watchApps: string[];
}

interface StoredState {
  /** The device this computer is registered as; the token is encrypted by the system. */
  device: { id: string; token: string; encrypted: boolean } | null;
  config: TrackerConfig;
  /** Spans not sent yet. */
  queue: Span[];
  /** The tracker is paused until this moment (ms); `0` — until resumed by hand. */
  pausedUntil: number | null;
}

const DEFAULTS: StoredState = {
  device: null,
  config: { idleMinutes: 5, excludedApps: [], watchApps: [] },
  queue: [],
  pausedUntil: null,
};
/** A guard for a computer that stays offline for weeks: the oldest spans give way. */
const MAX_QUEUE = 50_000;

/**
 * What the tracker keeps between launches, as JSON in the user folder next to settings.json:
 * the device's token, the settings from the server and the spans waiting to be sent.
 */
export class ActivityStore {
  private state: StoredState = this.load();

  get deviceId(): string | null {
    return this.state.device?.id ?? null;
  }

  get token(): string | null {
    const device = this.state.device;
    if (!device) {
      return null;
    }
    try {
      return device.encrypted
        ? safeStorage.decryptString(Buffer.from(device.token, 'base64'))
        : device.token;
    } catch {
      return null; // The system's key changed: the device has to be enabled again.
    }
  }

  setDevice(device: { id: string; token: string } | null): void {
    const encrypted = safeStorage.isEncryptionAvailable();
    this.state.device = device && {
      id: device.id,
      token: encrypted ? safeStorage.encryptString(device.token).toString('base64') : device.token,
      encrypted,
    };
    this.save();
  }

  get config(): TrackerConfig {
    return this.state.config;
  }

  setConfig(config: TrackerConfig): void {
    this.state.config = config;
    this.save();
  }

  get queue(): readonly Span[] {
    return this.state.queue;
  }

  enqueue(span: Span): void {
    this.state.queue = [...this.state.queue, span].slice(-MAX_QUEUE);
    this.save();
  }

  /** Drops the first `count` spans: they have reached the server. */
  dequeue(count: number): void {
    this.state.queue = this.state.queue.slice(count);
    this.save();
  }

  get pausedUntil(): number | null {
    return this.state.pausedUntil;
  }

  setPausedUntil(until: number | null): void {
    this.state.pausedUntil = until;
    this.save();
  }

  private path(): string {
    return join(app.getPath('userData'), 'activity.json');
  }

  private load(): StoredState {
    if (!existsSync(this.path())) {
      return { ...DEFAULTS };
    }
    try {
      const stored = JSON.parse(readFileSync(this.path(), 'utf8')) as StoredState;
      // A config saved by an older version lacks the newer fields.
      return { ...DEFAULTS, ...stored, config: { ...DEFAULTS.config, ...stored.config } };
    } catch {
      return { ...DEFAULTS };
    }
  }

  private save(): void {
    try {
      writeFileSync(this.path(), JSON.stringify(this.state));
    } catch {
      // The disk is full or the folder is gone: the state lives until the app quits.
    }
  }
}
