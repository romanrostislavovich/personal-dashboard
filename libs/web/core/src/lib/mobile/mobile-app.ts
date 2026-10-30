/**
 * Inside the Android app (apps/mobile, Capacitor) the interface is served by the app itself, at
 * https://localhost, and the API is the server the user named at the first start. In a browser
 * and in the desktop app the API is on the page's own origin and nothing here applies.
 */

/** Where the address of the server is kept on the phone. */
const SERVER_KEY = 'pd.mobile.server';
/** Where the phone keeps its own id: the list of devices, push notifications. */
const INSTALL_ID_KEY = 'pd.mobile.installId';

interface CapacitorGlobal {
  isNativePlatform?(): boolean;
}

/** Capacitor puts `window.Capacitor` on the page before any script of ours runs. */
export function isMobileApp(): boolean {
  const capacitor = (globalThis as {Capacitor?: CapacitorGlobal}).Capacitor;
  return capacitor?.isNativePlatform?.() === true;
}

/** The server the app talks to; `null` — not chosen yet (the connect page asks). */
export function mobileServer(): string | null {
  try {
    return localStorage.getItem(SERVER_KEY);
  } catch {
    return null;
  }
}

export function setMobileServer(url: string): void {
  localStorage.setItem(SERVER_KEY, url);
}

/** What the API is reached by: the server's address in the app, the same origin elsewhere. */
export function apiBaseUrl(): string {
  return isMobileApp() ? (mobileServer() ?? '') : '';
}

/**
 * What the user typed → the address of a server: `https://` when no scheme is given, no path,
 * no trailing slash. `null` — not an address.
 */
export function normalizeServer(input: string): string | null {
  const text = input.trim();
  if (!text) {
    return null;
  }
  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`,
    );
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** The app's own id on this phone, made once. */
export function installId(): string {
  let id = localStorage.getItem(INSTALL_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(INSTALL_ID_KEY, id);
  }
  return id;
}

/** `…(Linux; Android 12; Redmi Note 9 Pro Build/…; wv)…` → `Redmi Note 9 Pro`. */
export function phoneModel(userAgent: string): string {
  const model = userAgent
    .match(/Android [^;)]*; ([^;)]+?)(?: Build\/[^;)]*)?[;)]/)?.[1]
    ?.trim();
  return model && model !== 'K' ? model : 'Android';
}
