import { appsApi } from '@pd/client-core';
import { readJson, writeJson } from './storage';
import { dashboard, serverUrl } from './account';

/*
 * How the extension stays up to date without a store. It runs from a folder on the disk: the
 * desktop app keeps that folder equal to what the server hands out (`/extension-updates`).
 * Every UPDATE_MINUTES the extension compares the manifest on the disk with the one it runs and
 * reloads itself when they differ — Chrome reads an unpacked extension's files anew on reload.
 *
 * Without the desktop app nothing changes the folder: the extension sees that the server has a
 * newer version for longer than STALE_MS and the popup says so (Settings → Apps has the zip).
 * It also tells the server which version runs here, for the list of devices in Settings → Apps.
 */

export const UPDATE_ALARM = 'self-update';
const UPDATE_MINUTES = 30;
/** The desktop app checks every 2 hours: longer than that, it is not coming by itself. */
const STALE_MS = 3 * 60 * 60_000;
const REPORT_EVERY_MS = 6 * 60 * 60_000;

const STATE_KEY = 'selfUpdate';
const INSTALL_ID_KEY = 'installId';

interface UpdateState {
  /** The version the server hands out, as last seen. */
  serverVersion: string | null;
  /** Since when the server has had a version this extension does not run. */
  behindSince: number | null;
  reportedAt: number | null;
  reportedVersion: string | null;
}

export interface UpdateStatus {
  /** The server has had a newer version for a while, and it has not come. */
  outdated: boolean;
  /** Newer files are on the disk already: a reload runs them. */
  waitingReload: boolean;
}

/** The fingerprint of the running code (see apps/extension/build.mjs). */
function runningVersion(): string {
  const manifest = chrome.runtime.getManifest();
  return manifest.version_name ?? manifest.version;
}

export function scheduleSelfUpdate(): void {
  void chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: UPDATE_MINUTES });
}

/** The regular check: newer files on the disk, the server's version, the report to the server. */
export async function checkForUpdate(): Promise<void> {
  if ((await diskVersion()) !== chrome.runtime.getManifest().version && !(await popupOpen())) {
    chrome.runtime.reload();
    return;
  }
  await compareWithServer().catch(() => undefined);
  await reportInstall().catch(() => undefined);
}

export async function updateStatus(): Promise<UpdateStatus> {
  const state = await readState();
  return {
    outdated: state.behindSince !== null && Date.now() - state.behindSince > STALE_MS,
    waitingReload: (await diskVersion()) !== chrome.runtime.getManifest().version,
  };
}

/** The version of the manifest on the disk now; the running one when it cannot be read. */
async function diskVersion(): Promise<string> {
  try {
    const response = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
    return ((await response.json()) as { version: string }).version;
  } catch {
    return chrome.runtime.getManifest().version;
  }
}

/** A reload closes the popup: not while someone is using it. */
async function popupOpen(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.POPUP],
  });
  return contexts.length > 0;
}

async function compareWithServer(): Promise<void> {
  const server = await serverUrl();
  if (!server) {
    return;
  }
  const response = await fetch(`${server}/extension-updates/bundle.json`, { cache: 'no-store' });
  const state = await readState();
  // A server without the extension's files (run from the sources): nothing to compare with.
  const serverVersion = response.ok
    ? ((await response.json()) as { version: string }).version
    : null;
  const behind = serverVersion !== null && serverVersion !== runningVersion();
  await writeState({
    ...state,
    serverVersion,
    behindSince: behind ? (state.behindSince ?? Date.now()) : null,
  });
}

/** Tells the server this browser runs the extension, and which version: a few times a day. */
async function reportInstall(): Promise<void> {
  const client = await dashboard();
  if (!client || !(await client.session.refreshToken())) {
    return;
  }
  const state = await readState();
  const version = runningVersion();
  if (
    state.reportedVersion === version &&
    state.reportedAt !== null &&
    Date.now() - state.reportedAt < REPORT_EVERY_MS
  ) {
    return;
  }
  const { browser, system } = describeBrowser();
  await appsApi(client.api).report({
    installId: await installId(),
    kind: 'extension',
    name: `${browser} · ${system}`,
    platform: 'chrome',
    version,
  });
  await writeState({ ...state, reportedAt: Date.now(), reportedVersion: version });
}

/** Made once, kept on the disk: this browser is one line in the list of devices. */
async function installId(): Promise<string> {
  const saved = await readJson<string | null>(chrome.storage.local, INSTALL_ID_KEY, null);
  if (saved) {
    return saved;
  }
  const id = crypto.randomUUID();
  await writeJson(chrome.storage.local, INSTALL_ID_KEY, id);
  return id;
}

/** `Google Chrome`, `Microsoft Edge`, `Brave`…, and the system, as the browser tells them. */
function describeBrowser(): { browser: string; system: string } {
  const data = (
    navigator as Navigator & {
      userAgentData?: { brands: { brand: string }[]; platform: string };
    }
  ).userAgentData;
  const brand = data?.brands
    .map((entry) => entry.brand)
    .find((name) => !/not.?a.?brand|chromium/i.test(name));
  return { browser: brand ?? 'Chromium', system: data?.platform || 'unknown' };
}

function readState(): Promise<UpdateState> {
  return readJson<UpdateState>(chrome.storage.local, STATE_KEY, {
    serverVersion: null,
    behindSince: null,
    reportedAt: null,
    reportedVersion: null,
  });
}

function writeState(state: UpdateState): Promise<void> {
  return writeJson(chrome.storage.local, STATE_KEY, state);
}
