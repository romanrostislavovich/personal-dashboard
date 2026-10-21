import { ApiError, createDashboardClient, DashboardClient } from '@pd/client-core';
import { ExtensionError, SignInResult } from '../shared/messages';
import { chromeStore } from './storage';
import { clearTelemetryConsent, telemetryExclusive } from './telemetry-state';
import { clearWorkstatePreview } from './workstate-state';

/** The dashboard's address, kept after signing out so the next sign-in has it filled in. */
const SERVER_KEY = 'server';
/** The 15-minute access token, in session storage: a sleeping service worker forgets memory. */
const ACCESS_KEY = 'accessToken';

const local = chromeStore(chrome.storage.local);
const session = chromeStore(chrome.storage.session);

let current: { server: string; client: Promise<DashboardClient> } | null = null;

export function serverUrl(): Promise<string | null> {
  return local.get(SERVER_KEY);
}

/**
 * The client core for the saved server, signed in or not; `null` — no server yet. The extension
 * is an `app` for the server: the refresh token comes in the answer and is kept in
 * `chrome.storage.local`, as the desktop app keeps it in its own store.
 */
export async function dashboard(): Promise<DashboardClient | null> {
  const server = await serverUrl();
  if (!server) {
    return null;
  }
  if (current?.server !== server) {
    current = { server, client: connect(server) };
  }
  return current.client;
}

/** The client of a signed-in user; throws `signed-out` otherwise. */
export async function signedInClient(): Promise<DashboardClient> {
  const client = await dashboard();
  if (!client || !(await client.session.refreshToken())) {
    throw new ExtensionError('signed-out');
  }
  return client;
}

export async function email(): Promise<string | null> {
  return (await (await dashboard())?.offlineUser())?.email ?? null;
}

export async function signIn(
  address: string,
  email: string,
  password: string,
): Promise<SignInResult> {
  clearWorkstatePreview();
  return telemetryExclusive(async () => {
    clearWorkstatePreview();
    await clearTelemetryConsent();
    const server = normalizeServer(address);
    await checkServer(server);
    await local.set(SERVER_KEY, server);
    const client = await signedOutClient();
    const result = await call(() => client.signIn({ email, password }), 'wrong-password');
    return result.status === 'signed-in' ? { status: 'signed-in' } : result;
  });
}

export async function completeSignIn(challengeToken: string, code: string): Promise<void> {
  clearWorkstatePreview();
  return telemetryExclusive(async () => {
    clearWorkstatePreview();
    await clearTelemetryConsent();
    const client = await signedOutClient();
    await call(() => client.completeSignIn(challengeToken, code), 'wrong-code');
  });
}

export async function signOut(): Promise<void> {
  clearWorkstatePreview();
  return telemetryExclusive(async () => {
    clearWorkstatePreview();
    await clearTelemetryConsent();
    await (await dashboard())?.signOut();
    await session.remove(ACCESS_KEY);
  });
}

async function connect(server: string): Promise<DashboardClient> {
  const client = createDashboardClient({
    baseUrl: server,
    storage: local,
    refreshTokenIn: 'storage',
  });
  const saved = await session.get(ACCESS_KEY);
  if (saved) {
    await client.session.start(saved);
  }
  client.session.subscribe(
    (token) => void (token ? session.set(ACCESS_KEY, token) : session.remove(ACCESS_KEY)),
  );
  return client;
}

async function signedOutClient(): Promise<DashboardClient> {
  const client = await dashboard();
  if (!client) {
    throw new ExtensionError('signed-out');
  }
  return client;
}

/**
 * `https://…` without a trailing slash. Plain http only for this computer and the local network:
 * the account password and the vault's ciphertext should not cross the internet unencrypted.
 */
function normalizeServer(address: string): string {
  const text = address.trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new ExtensionError('not-dashboard');
  }
  const local =
    /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|\[::1\])$/.test(
      url.hostname,
    );
  if (url.protocol !== 'https:' && !local) {
    throw new ExtensionError('insecure-server');
  }
  return url.origin;
}

/** The address answers like a dashboard does. */
async function checkServer(server: string): Promise<void> {
  let body: unknown;
  try {
    const response = await fetch(`${server}/api/health`);
    body = await response.json();
  } catch {
    throw new ExtensionError('not-dashboard');
  }
  if ((body as { status?: unknown } | null)?.status !== 'ok') {
    throw new ExtensionError('not-dashboard');
  }
}

/** A sign-in call: a 401 or 400 is the wrong password (or code); no answer — unreachable. */
async function call<T>(
  work: () => Promise<T>,
  refused: 'wrong-password' | 'wrong-code',
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiError) {
      throw new ExtensionError(error.status === 401 || error.status === 400 ? refused : 'failed');
    }
    throw new ExtensionError('unreachable');
  }
}
