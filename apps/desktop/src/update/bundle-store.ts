import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The shell is two parts. The **base** is what the installer puts on the computer: Electron
 * and a small loader (loader.ts). The **bundle** is the code of the app itself — a few files
 * (app.js, preload.js, assets). A bundle comes with the installer, and newer ones are
 * downloaded from the server into the user folder, so the app updates without an installer
 * ever being run (updater.ts).
 */
export interface BundleManifest {
  /** A fingerprint of the files: two bundles with the same version are the same code. */
  version: string;
  /**
   * Which base the bundle is written for. Raised when the code starts to need a newer
   * Electron or loader: an older base then keeps its bundle and asks for a reinstall.
   */
  shell: number;
  /** File name (`app.js`, `assets/icon.png`) → sha512 of its content, base64. */
  files: Record<string, string>;
}

export const MANIFEST_FILE = 'bundle.json';
/** The base this code is built for (see BundleManifest.shell). */
export const SHELL_VERSION = 1;

/** `app.js` or `assets/icon.png`: nothing that could lead out of the bundle's folder. */
const SAFE_NAME = /^[\w-][\w.-]*(\/[\w-][\w.-]*)?$/;

export function sha512(content: Buffer): string {
  return createHash('sha512').update(content).digest('base64');
}

export function isManifest(value: unknown): value is BundleManifest {
  const manifest = value as BundleManifest | null;
  return (
    !!manifest &&
    typeof manifest.version === 'string' &&
    typeof manifest.shell === 'number' &&
    !!manifest.files &&
    typeof manifest.files === 'object' &&
    typeof manifest.files['app.js'] === 'string' &&
    Object.entries(manifest.files).every(
      ([name, hash]) => SAFE_NAME.test(name) && typeof hash === 'string',
    )
  );
}

/** The manifest of a folder if every file in it is what the manifest says; `null` otherwise. */
export function readBundle(dir: string): BundleManifest | null {
  try {
    const manifest: unknown = JSON.parse(readFileSync(join(dir, MANIFEST_FILE), 'utf8'));
    if (!isManifest(manifest)) {
      return null;
    }
    const intact = Object.entries(manifest.files).every(
      ([name, hash]) => sha512(readFileSync(join(dir, name))) === hash,
    );
    return intact ? manifest : null;
  } catch {
    return null;
  }
}

interface StoreState {
  /** The bundle of the installed base: a reinstall brings another and starts afresh. */
  builtin: string | null;
  /** A downloaded bundle is being started; still here on the next start — it did not start. */
  starting: string | null;
  /** Bundles that did not start: never tried again. */
  bad: string[];
}

/**
 * Downloaded bundles in the user folder (`<userData>/updates`): `current` is the one in use,
 * `next` is downloaded and waits for a restart.
 */
export class BundleStore {
  constructor(private readonly root: string) {}

  /**
   * Called by the loader before anything else: the folder of the bundle to run, or `null`
   * for the one that came with the installer. Moves a downloaded bundle into place and
   * drops one that failed to start last time.
   */
  choose(builtin: BundleManifest): string | null {
    let state = this.state();
    if (state.builtin !== builtin.version) {
      // A fresh install (or a reinstall): what was downloaded for the old one is not kept.
      rmSync(this.root, { recursive: true, force: true });
      state = { builtin: builtin.version, starting: null, bad: [] };
    }
    if (state.starting) {
      state.bad = [...state.bad, state.starting];
      state.starting = null;
      rmSync(this.current, { recursive: true, force: true });
    }
    if (existsSync(this.next)) {
      rmSync(this.current, { recursive: true, force: true });
      renameSync(this.next, this.current);
    }

    const downloaded = readBundle(this.current);
    const usable =
      downloaded &&
      downloaded.shell === SHELL_VERSION &&
      downloaded.version !== builtin.version &&
      !state.bad.includes(downloaded.version);
    state.starting = usable ? downloaded.version : null;
    this.save(state);
    return usable ? this.current : null;
  }

  /** The app is up: the bundle it was started from is good. */
  confirmStarted(): void {
    const state = this.state();
    if (state.starting) {
      this.save({ ...state, starting: null });
    }
  }

  isBad(version: string): boolean {
    return this.state().bad.includes(version);
  }

  /** The version downloaded and waiting for a restart. */
  get pending(): string | null {
    return readBundle(this.next)?.version ?? null;
  }

  /** Saves a downloaded bundle as the one to switch to on the next start. */
  stage(manifest: BundleManifest, files: ReadonlyMap<string, Buffer>): void {
    const staging = join(this.root, 'downloading');
    rmSync(staging, { recursive: true, force: true });
    for (const [name, content] of files) {
      const path = join(staging, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    writeFileSync(join(staging, MANIFEST_FILE), JSON.stringify(manifest));
    rmSync(this.next, { recursive: true, force: true });
    renameSync(staging, this.next);
  }

  private get current(): string {
    return join(this.root, 'current');
  }

  private get next(): string {
    return join(this.root, 'next');
  }

  private state(): StoreState {
    try {
      const state = JSON.parse(readFileSync(join(this.root, 'state.json'), 'utf8')) as StoreState;
      return {
        builtin: state.builtin ?? null,
        starting: state.starting ?? null,
        bad: state.bad ?? [],
      };
    } catch {
      return { builtin: null, starting: null, bad: [] };
    }
  }

  private save(state: StoreState): void {
    mkdirSync(this.root, { recursive: true });
    writeFileSync(join(this.root, 'state.json'), JSON.stringify(state));
  }
}
