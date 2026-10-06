import { app } from 'electron';
import { join } from 'node:path';
import { BundleStore, readBundle } from './update/bundle-store';

/**
 * The entry point of the installed app (main.js): picks the code to run and hands over to it.
 * That is the bundle downloaded from the server when there is a newer one that fits this
 * base, and the bundle that came with the installer otherwise (see update/bundle-store.ts).
 *
 * Kept as small as it can be: this file is the one part an update cannot replace.
 */
function bundleFolder(): string {
  const builtin = join(__dirname, 'bundle');
  // From the sources there is nothing to update: the code on disk is the newest there is.
  if (!app.isPackaged) {
    return builtin;
  }
  try {
    const manifest = readBundle(builtin);
    const store = new BundleStore(join(app.getPath('userData'), 'updates'));
    return (manifest && store.choose(manifest)) ?? builtin;
  } catch {
    return builtin; // A broken updates folder must never keep the app from starting.
  }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the path is known only now
require(join(bundleFolder(), 'app.js'));
