import { CachedRead, ReadCache } from '@pd/client-core';

const DB_NAME = 'pd-read-cache';
const STORE = 'reads';
/** Enough for months of the diary and every section looked at; the oldest go first. */
const MAX_READS = 3000;
/** The size is checked every this many writes, not on each one. */
const TRIM_EVERY = 50;

interface Row extends CachedRead {
  url: string;
}

/**
 * The read cache of the Android app (see ReadCache in client-core) in IndexedDB: answers can
 * be megabytes, more than `localStorage` holds. Nothing here throws: without IndexedDB the app
 * just reads nothing offline.
 */
export function indexedDbReadCache(): ReadCache {
  let opened: Promise<IDBDatabase> | null = null;
  let writes = 0;

  const db = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'url' });
        store.createIndex('at', 'at');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));

  const run = async <T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T> | void,
  ): Promise<T | undefined> => {
    const transaction = (await db()).transaction(STORE, mode);
    const request = work(transaction.objectStore(STORE));
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(request ? request.result : undefined);
      transaction.onerror = () => reject(transaction.error);
    });
  };

  /** The oldest answers go once there are too many. */
  const trim = () =>
    run('readwrite', (store) => {
      const count = store.count();
      count.onsuccess = () => {
        let extra = count.result - MAX_READS;
        if (extra <= 0) {
          return;
        }
        store.index('at').openCursor().onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (cursor && extra-- > 0) {
            cursor.delete();
            cursor.continue();
          }
        };
      };
    });

  return {
    async get(url) {
      try {
        const row = await run<Row | undefined>('readonly', (store) => store.get(url));
        return row ? { body: row.body, at: row.at } : null;
      } catch {
        return null;
      }
    },
    async put(url, body) {
      try {
        const row: Row = { url, body, at: new Date().toISOString() };
        await run('readwrite', (store) => {
          store.put(row);
        });
        if (++writes % TRIM_EVERY === 0) {
          await trim();
        }
      } catch {
        // Full or blocked: this answer is just not kept.
      }
    },
    async clear() {
      try {
        await run('readwrite', (store) => {
          store.clear();
        });
      } catch {
        // Nothing could be kept either.
      }
    },
  };
}

let shared: ReadCache | null = null;

/** One cache for the client core and HttpClient alike. */
export function mobileReadCache(): ReadCache {
  return (shared ??= indexedDbReadCache());
}
