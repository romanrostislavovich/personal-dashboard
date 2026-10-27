/**
 * Answers of the API kept on the device, for reading without a connection: an app that has no
 * service worker (the Android app) keeps what it read here, and when the server cannot be
 * reached the last answer is shown instead of an error. A browser has the service worker for
 * this and needs none.
 */
export interface ReadCache {
  get(url: string): Promise<CachedRead | null>;
  put(url: string, body: unknown): Promise<void>;
  /** On signing out and on another server: what was read belongs to that account. */
  clear(): Promise<void>;
  /**
   * Files that never change at their address (a diary photo by its id), kept as they are: the
   * diary of a train needs its photos too. A cache without them keeps no files.
   */
  getFile?(url: string): Promise<Blob | null>;
  putFile?(url: string, file: Blob): Promise<void>;
}

export interface CachedRead {
  body: unknown;
  /** When it was read (ISO). */
  at: string;
}

/** The live stream and signing in are never kept: an old answer there means nothing. */
const NEVER = /^\/api\/(events|auth)(\/|$)/;

/** Whether the answer to a read of `path` (`/api/...`) may be kept for offline reading. */
export function isCacheable(path: string): boolean {
  return path.startsWith('/api/') && !NEVER.test(path);
}

/** A cache in memory: for tests, and for a platform that has nothing better. */
export function memoryReadCache(): ReadCache {
  const reads = new Map<string, CachedRead>();
  const files = new Map<string, Blob>();
  return {
    async get(url) {
      return reads.get(url) ?? null;
    },
    async put(url, body) {
      reads.set(url, { body, at: new Date().toISOString() });
    },
    async clear() {
      reads.clear();
      files.clear();
    },
    async getFile(url) {
      return files.get(url) ?? null;
    },
    async putFile(url, file) {
      files.set(url, file);
    },
  };
}
