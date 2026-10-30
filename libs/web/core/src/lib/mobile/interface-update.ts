import {WebView} from '@capacitor/core';
import {Directory, Filesystem} from '@capacitor/filesystem';
import {unzipSync} from 'fflate';

/**
 * A newer interface for the Android app. The APK carries the interface it was built with; the
 * server hands out its own (`/mobile-updates`: `bundle.json` with the version and `web.zip`,
 * made by the Docker build), so a deploy reaches the phone without a new APK:
 *
 * 1. the zip is unpacked into the app's files (`bundles/<version>`);
 * 2. when the app goes to the background the web view is pointed at that folder — the reload
 *    happens out of sight — and the folder is kept for the next starts.
 *
 * A new APK starts from its own interface again (Capacitor forgets the folder), and this takes
 * the server's one anew. A broken interface from the server is mended the same way.
 */

const UPDATES_PATH = '/mobile-updates';
const BUNDLES_DIR = 'bundles';
/** Unpacked and waiting for the app to go to the background. */
const PENDING_KEY = 'pd.mobile.pendingBundle';

interface PendingBundle {
  version: string;
  path: string;
}

/** The version of the interface shown now; `null` — the one inside the APK. */
export async function currentBundle(): Promise<string | null> {
  const {path} = await WebView.getServerBasePath();
  const match = path.match(new RegExp(`/${BUNDLES_DIR}/([^/]+)/?$`));
  return match?.[1] ?? null;
}

/** Takes the server's interface if it differs from the one shown (and is not unpacked yet). */
export async function fetchNewerBundle(server: string): Promise<void> {
  const response = await fetch(`${server}${UPDATES_PATH}/bundle.json`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    return; // A server without the mobile interface.
  }
  const {version} = (await response.json()) as {version?: unknown};
  if (typeof version !== 'string' || !/^[\w.-]+$/.test(version)) {
    return;
  }
  if (
    version === (await currentBundle()) ||
    version === pendingBundle()?.version
  ) {
    return;
  }
  const zip = await fetch(`${server}${UPDATES_PATH}/web.zip`, {
    cache: 'no-store',
  });
  if (!zip.ok) {
    return;
  }
  const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  if (!files['index.html']) {
    return; // Not an interface: the one shown stays.
  }
  const dir = `${BUNDLES_DIR}/${version}`;
  await Filesystem.rmdir({
    path: dir,
    directory: Directory.Data,
    recursive: true,
  }).catch(() => undefined);
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) {
      continue;
    }
    await Filesystem.writeFile({
      path: `${dir}/${name}`,
      data: toBase64(data),
      directory: Directory.Data,
      recursive: true,
    });
  }
  const {uri} = await Filesystem.getUri({path: dir, directory: Directory.Data});
  const pending: PendingBundle = {
    version,
    path: decodeURIComponent(new URL(uri).pathname),
  };
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

/** In the background: shows the unpacked interface from now on. The page reloads. */
export async function applyPendingBundle(): Promise<void> {
  const pending = pendingBundle();
  if (!pending) {
    return;
  }
  localStorage.removeItem(PENDING_KEY);
  await WebView.setServerBasePath({path: pending.path});
  await WebView.persistServerBasePath();
}

/** The folders of interfaces neither shown nor waiting: they only take space. */
export async function removeOldBundles(): Promise<void> {
  const keep = new Set([await currentBundle(), pendingBundle()?.version]);
  const {files} = await Filesystem.readdir({
    path: BUNDLES_DIR,
    directory: Directory.Data,
  }).catch(() => ({files: []}));
  for (const entry of files) {
    if (!keep.has(entry.name)) {
      await Filesystem.rmdir({
        path: `${BUNDLES_DIR}/${entry.name}`,
        directory: Directory.Data,
        recursive: true,
      }).catch(() => undefined);
    }
  }
}

function pendingBundle(): PendingBundle | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(PENDING_KEY) ?? 'null',
    ) as PendingBundle | null;
    return value &&
      typeof value.version === 'string' &&
      typeof value.path === 'string'
      ? value
      : null;
  } catch {
    return null;
  }
}

/** Filesystem takes binary files as base64. */
function toBase64(bytes: Uint8Array): string {
  let text = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    text += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(text);
}
