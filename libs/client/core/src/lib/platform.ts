/**
 * What a client platform provides to the core: a browser, the desktop shell (a browser inside),
 * a mobile app. Everything else in the core is plain TypeScript.
 */
export interface ClientPlatform {
  /**
   * Where the dashboard API is: `''` for the same origin (the web app served by the API),
   * `https://dash.example.com` for an app that talks to a server from elsewhere.
   */
  baseUrl: string;
  /** Keeps the session between launches: `localStorage`, a phone's secure store… */
  storage: KeyValueStore;
  /** The platform's `fetch`; the global one by default. */
  fetch?: typeof fetch;
}

/** A small key-value store; asynchronous, as secure stores on phones are. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** `localStorage` as a KeyValueStore; without storage (private mode) values live in memory. */
export function browserStorage(): KeyValueStore {
  const memory = new Map<string, string>();
  const storage = (): Storage | null => {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null; // Access to storage is blocked.
    }
  };
  return {
    async get(key) {
      try {
        return storage()?.getItem(key) ?? memory.get(key) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    async set(key, value) {
      memory.set(key, value);
      try {
        storage()?.setItem(key, value);
      } catch {
        // Full or blocked: the value lasts until the app is closed.
      }
    },
    async remove(key) {
      memory.delete(key);
      try {
        storage()?.removeItem(key);
      } catch {
        // Blocked: nothing was stored there anyway.
      }
    },
  };
}
