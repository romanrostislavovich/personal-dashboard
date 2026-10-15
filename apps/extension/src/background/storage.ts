import { KeyValueStore } from '@pd/client-core';

/**
 * A `chrome.storage` area as the client core's KeyValueStore.
 * - `local` — on disk, until signed out: the server, the refresh token, the profile;
 * - `session` — in the browser's memory only, gone when Chrome closes; readable by the
 *   extension's own pages and the service worker, not by content scripts: the access token,
 *   the open vault key, a login waiting to be saved.
 */
export function chromeStore(area: chrome.storage.StorageArea): KeyValueStore {
  return {
    async get(key) {
      const value = (await area.get(key))[key];
      return typeof value === 'string' ? value : null;
    },
    set: (key, value) => area.set({ [key]: value }),
    remove: (key) => area.remove(key),
  };
}

/** A JSON value of an area; `fallback` when there is none or it is broken. */
export async function readJson<T>(
  area: chrome.storage.StorageArea,
  key: string,
  fallback: T,
): Promise<T> {
  const value = (await area.get(key))[key];
  return value === undefined ? fallback : (value as T);
}

export function writeJson(
  area: chrome.storage.StorageArea,
  key: string,
  value: unknown,
): Promise<void> {
  return area.set({ [key]: value });
}
