import { app, net } from 'electron';
import { join } from 'node:path';
import {
  BundleManifest,
  BundleStore,
  isManifest,
  MANIFEST_FILE,
  readBundle,
  sha512,
  SHELL_VERSION,
} from './bundle-store';

/** The first check waits for the app to settle; then the server is asked a few times a day. */
const FIRST_CHECK_MS = 15_000;
const CHECK_EVERY_MS = 2 * 60 * 60 * 1000;
/** The whole bundle is well under a megabyte; anything huge is not a bundle. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Where a server keeps the bundle of the shell (apps/api serves it from its image). */
const UPDATES_PATH = '/desktop-updates';

export type UpdateState =
  /** Run from the sources, or no server to ask. */
  | { kind: 'off' }
  | { kind: 'idle' }
  | { kind: 'checking' }
  /** Downloaded: the app switches to it on its next start. */
  | { kind: 'ready'; version: string }
  /** The server has code for a newer base: only a reinstall brings it. */
  | { kind: 'reinstall' }
  | { kind: 'error' };

/**
 * Updates of the shell without an installer: the server the app is connected to serves the
 * bundle of its own version (`/desktop-updates/bundle.json` and the files it lists). When it
 * differs from the one running, the files are downloaded, checked against the hashes of the
 * manifest and kept for the next start — the shell restarts into them when its window is out
 * of sight (main.ts). The server is the truth: a rollback there brings the older code back.
 */
export class AppUpdater {
  private current: UpdateState = { kind: 'off' };
  private readonly running = readBundle(__dirname);
  private readonly store = new BundleStore(join(app.getPath('userData'), 'updates'));
  private busy = false;

  constructor(
    private readonly serverUrl: () => string | null,
    private readonly onChange: () => void,
    /** An update is downloaded: the shell decides when to restart into it. */
    private readonly onReady: () => void,
  ) {}

  get state(): UpdateState {
    return this.current;
  }

  /** The code that is running, for the tray: the first characters of its fingerprint. */
  get version(): string {
    return this.running?.version.slice(0, 7) ?? 'dev';
  }

  start(): void {
    // The loader has started this bundle and the app got as far as here: it is a good one.
    this.store.confirmStarted();
    if (!app.isPackaged || !this.running) {
      return;
    }
    this.set({ kind: 'idle' });
    setTimeout(() => void this.check(), FIRST_CHECK_MS);
    setInterval(() => void this.check(), CHECK_EVERY_MS);
  }

  async check(): Promise<void> {
    const base = this.feed();
    if (!base || !this.running || this.busy || this.current.kind === 'off') {
      return;
    }
    this.busy = true;
    this.set({ kind: 'checking' });
    try {
      this.set(await this.update(base, this.running));
    } catch {
      // No connection, or a server that is being restarted: the next check tries again.
      this.set({ kind: 'error' });
    } finally {
      this.busy = false;
    }
    if (this.current.kind === 'ready') {
      this.onReady();
    }
  }

  private async update(base: string, running: BundleManifest): Promise<UpdateState> {
    const answer = await net.fetch(`${base}/${MANIFEST_FILE}`, { cache: 'no-store' });
    if (answer.status === 404) {
      return { kind: 'idle' }; // A server that does not hand out bundles (run from the sources).
    }
    if (!answer.ok) {
      throw new Error(`${MANIFEST_FILE}: ${answer.status}`);
    }
    const manifest: unknown = await answer.json();
    if (!isManifest(manifest)) {
      throw new Error('Not a bundle manifest');
    }
    if (manifest.version === running.version || this.store.isBad(manifest.version)) {
      return { kind: 'idle' };
    }
    if (manifest.shell !== SHELL_VERSION) {
      return { kind: 'reinstall' };
    }
    if (this.store.pending !== manifest.version) {
      const files = new Map<string, Buffer>();
      for (const [name, hash] of Object.entries(manifest.files)) {
        const content = await this.download(`${base}/${name}`);
        if (sha512(content) !== hash) {
          throw new Error(`${name} is not what the manifest says`);
        }
        files.set(name, content);
      }
      this.store.stage(manifest, files);
    }
    return { kind: 'ready', version: manifest.version.slice(0, 7) };
  }

  /**
   * The address of the bundle on the server the app is connected to. Code is taken only over
   * HTTPS or from this computer: plain HTTP could be changed on the way.
   */
  private feed(): string | null {
    try {
      const url = new URL(this.serverUrl() ?? '');
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      return url.protocol === 'https:' || local ? url.origin + UPDATES_PATH : null;
    } catch {
      return null;
    }
  }

  private async download(url: string): Promise<Buffer> {
    const response = await net.fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`${url}: ${response.status}`);
    }
    const content = Buffer.from(await response.arrayBuffer());
    if (content.length > MAX_FILE_BYTES) {
      throw new Error(`${url} is too large`);
    }
    return content;
  }

  private set(state: UpdateState): void {
    this.current = state;
    this.onChange();
  }
}
