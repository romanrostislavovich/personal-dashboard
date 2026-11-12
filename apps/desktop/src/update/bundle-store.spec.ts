import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  BundleManifest,
  BundleStore,
  SHELL_VERSION,
  sha512,
} from './bundle-store';

const builtin: BundleManifest = {
  version: 'builtin',
  shell: SHELL_VERSION,
  files: {'app.js': 'x'},
};

function downloaded(version: string): {
  manifest: BundleManifest;
  files: Map<string, Buffer>;
} {
  const app = Buffer.from(`// ${version}`);
  return {
    manifest: {version, shell: SHELL_VERSION, files: {'app.js': sha512(app)}},
    files: new Map([['app.js', app]]),
  };
}

describe('BundleStore', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bundle-store-'));
  });

  afterEach(() => {
    rmSync(root, {recursive: true, force: true});
  });

  it('marks a bundle bad when the app did not get as far as starting it', () => {
    const store = new BundleStore(root);
    const update = downloaded('v2');
    store.choose(builtin);
    store.stage(update.manifest, update.files);
    expect(store.choose(builtin)).toBe(join(root, 'current'));
    // The app died before confirmStarted: the next start drops the bundle.
    expect(store.choose(builtin)).toBeNull();
    expect(store.isBad('v2')).toBe(true);
  });

  it('keeps a bundle whose copy stood down for another running copy', () => {
    const store = new BundleStore(root);
    const update = downloaded('v2');
    store.choose(builtin);
    store.stage(update.manifest, update.files);
    // Restarted into the update while the old copy still held the lock: this copy quits.
    expect(store.choose(builtin)).toBe(join(root, 'current'));
    store.standDown();
    // The next start runs the update.
    expect(store.choose(builtin)).toBe(join(root, 'current'));
    expect(store.isBad('v2')).toBe(false);
  });

  it('ignores a broken file in the current folder', () => {
    mkdirSync(join(root, 'current'), {recursive: true});
    writeFileSync(join(root, 'current', 'bundle.json'), '{');
    expect(new BundleStore(root).choose(builtin)).toBeNull();
  });
});
