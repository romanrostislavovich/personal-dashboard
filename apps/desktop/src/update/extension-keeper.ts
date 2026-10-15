import { app, net } from 'electron';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { sha512 } from './bundle-store';
import { secureOrigin } from './updater';

/*
 * The browser extension's folder, kept equal to what the server hands out
 * (`/extension-updates`, built by apps/extension/build.mjs). Chrome loads the extension from
 * this folder once ("Load unpacked", Settings → Apps shows the path); after that the extension
 * notices new files here and reloads itself (apps/extension/src/background/self-update.ts).
 * So the extension updates as the desktop app does, with no store and no installer.
 */

const UPDATES_PATH = '/extension-updates';
const MANIFEST_FILE = 'bundle.json';
const FIRST_CHECK_MS = 20_000;
const CHECK_EVERY_MS = 2 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** `background.js`, `icons/16.png`, `_locales/ru/messages.json`: nothing that leads out. */
const SAFE_NAME = /^[\w-][\w.-]*(\/[\w-][\w.-]*){0,2}$/;

interface ExtensionManifest {
  version: string;
  files: Record<string, string>;
}

export interface ExtensionStatus {
  /** Where Chrome loads it from. */
  folder: string;
  /** The version in the folder; `null` — not downloaded yet (no server, or it has none). */
  version: string | null;
}

export class ExtensionKeeper {
  readonly folder = join(app.getPath('userData'), 'browser-extension');
  private busy = false;

  constructor(private readonly serverUrl: () => string | null) {}

  status(): ExtensionStatus {
    return { folder: this.folder, version: this.local()?.version ?? null };
  }

  start(): void {
    setTimeout(() => void this.check(), FIRST_CHECK_MS);
    setInterval(() => void this.check(), CHECK_EVERY_MS);
  }

  /** Brings the folder to the server's version; quietly does nothing without a connection. */
  async check(): Promise<void> {
    const origin = secureOrigin(this.serverUrl());
    if (!origin || this.busy) {
      return;
    }
    this.busy = true;
    try {
      await this.update(origin + UPDATES_PATH);
    } catch {
      // No connection, or a server being restarted: the next check tries again.
    } finally {
      this.busy = false;
    }
  }

  private async update(base: string): Promise<void> {
    const answer = await net.fetch(`${base}/${MANIFEST_FILE}`, { cache: 'no-store' });
    if (!answer.ok) {
      return; // A server without the extension (run from the sources).
    }
    const manifest: unknown = await answer.json();
    if (!isManifest(manifest)) {
      throw new Error('Not an extension manifest');
    }
    if (this.local()?.version === manifest.version) {
      return;
    }
    const files = new Map<string, Buffer>();
    for (const [name, hash] of Object.entries(manifest.files)) {
      const content = await this.download(`${base}/${name}`);
      if (sha512(content) !== hash) {
        throw new Error(`${name} is not what the manifest says`);
      }
      files.set(name, content);
    }
    this.replace(manifest, files);
  }

  /**
   * Puts the new files in place, each with a rename (never half a file), the extension's own
   * manifest last but one and `bundle.json` last: the extension reloads when its manifest
   * changes, and by then the code it loads is all there.
   */
  private replace(manifest: ExtensionManifest, files: Map<string, Buffer>): void {
    mkdirSync(this.folder, { recursive: true });
    const order = [...files.keys()].sort(
      (a, b) => Number(a === 'manifest.json') - Number(b === 'manifest.json'),
    );
    for (const name of order) {
      const target = join(this.folder, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(`${target}.tmp`, files.get(name) as Buffer);
      renameSync(`${target}.tmp`, target);
    }
    for (const name of listFiles(this.folder)) {
      if (name !== MANIFEST_FILE && !files.has(name)) {
        rmSync(join(this.folder, name), { force: true });
      }
    }
    const bundle = join(this.folder, MANIFEST_FILE);
    writeFileSync(`${bundle}.tmp`, JSON.stringify(manifest, null, 2));
    renameSync(`${bundle}.tmp`, bundle);
  }

  /** The manifest of the folder if every file is what it says; `null` otherwise. */
  private local(): ExtensionManifest | null {
    try {
      const manifest: unknown = JSON.parse(readFileSync(join(this.folder, MANIFEST_FILE), 'utf8'));
      if (!isManifest(manifest)) {
        return null;
      }
      const intact = Object.entries(manifest.files).every(
        ([name, hash]) => sha512(readFileSync(join(this.folder, name))) === hash,
      );
      return intact ? manifest : null;
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
}

function isManifest(value: unknown): value is ExtensionManifest {
  const manifest = value as ExtensionManifest | null;
  return (
    !!manifest &&
    typeof manifest.version === 'string' &&
    !!manifest.files &&
    typeof manifest.files === 'object' &&
    typeof manifest.files['manifest.json'] === 'string' &&
    Object.entries(manifest.files).every(
      ([name, hash]) => SAFE_NAME.test(name) && name !== MANIFEST_FILE && typeof hash === 'string',
    )
  );
}

/** Every file under a folder, as `a/b.png`. */
function listFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const walk = (at: string): string[] =>
    readdirSync(at).flatMap((name) => {
      const path = join(at, name);
      return statSync(path).isDirectory() ? walk(path) : [relative(dir, path).replace(/\\/g, '/')];
    });
  return walk(dir);
}
