import {CachedRead, ReadCache} from '@pd/client-core';

const DB_NAME = 'pd-read-cache';
const STORE = 'reads';
/** Kept files (diary photos), Blobs as they came. */
const FILES = 'files';
/** Enough for months of the diary and every section looked at; the oldest go first. */
const MAX_READS = 3000;
/** Photos are made small on upload (about 200–500 KB): a few months of them, 100–150 MB. */
const MAX_FILES = 300;
/** The size is checked every this many writes, not on each one. */
const TRIM_EVERY = 50;

interface Row extends CachedRead {
  url: string;
}

interface FileRow {
  url: string;
  file: Blob;
  at: string;
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
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = event => {
        // Version 1 had the reads only; version 2 added the files.
        if (event.oldVersion < 1) {
          request.result
            .createObjectStore(STORE, {keyPath: 'url'})
            .createIndex('at', 'at');
        }
        if (event.oldVersion < 2) {
          request.result
            .createObjectStore(FILES, {keyPath: 'url'})
            .createIndex('at', 'at');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));

  const run = async <T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T> | void,
    storeName = STORE,
  ): Promise<T | undefined> => {
    const transaction = (await db()).transaction(storeName, mode);
    const request = work(transaction.objectStore(storeName));
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () =>
        resolve(request ? request.result : undefined);
      transaction.onerror = () => reject(transaction.error);
    });
  };

  /** The oldest answers (or files) go once there are too many. */
  const trim = (storeName = STORE, max = MAX_READS) =>
    run(
      'readwrite',
      store => {
        const count = store.count();
        count.onsuccess = () => {
          let extra = count.result - max;
          if (extra <= 0) {
            return;
          }
          store.index('at').openCursor().onsuccess = event => {
            const cursor = (
              event.target as IDBRequest<IDBCursorWithValue | null>
            ).result;
            if (cursor && extra-- > 0) {
              cursor.delete();
              cursor.continue();
            }
          };
        };
      },
      storeName,
    );
  let fileWrites = 0;

  return {
    async get(url) {
      try {
        const row = await run<Row | undefined>('readonly', store =>
          store.get(url),
        );
        return row ? {body: row.body, at: row.at} : null;
      } catch {
        return null;
      }
    },
    async put(url, body) {
      try {
        const row: Row = {url, body, at: new Date().toISOString()};
        await run('readwrite', store => {
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
        await run('readwrite', store => {
          store.clear();
        });
        await run(
          'readwrite',
          store => {
            store.clear();
          },
          FILES,
        );
      } catch {
        // Nothing could be kept either.
      }
    },
    async getFile(url) {
      try {
        const row = await run<FileRow | undefined>(
          'readonly',
          store => store.get(url),
          FILES,
        );
        return row?.file ?? null;
      } catch {
        return null;
      }
    },
    async putFile(url, file) {
      try {
        const row: FileRow = {url, file, at: new Date().toISOString()};
        await run(
          'readwrite',
          store => {
            store.put(row);
          },
          FILES,
        );
        if (++fileWrites % 20 === 0) {
          await trim(FILES, MAX_FILES);
        }
      } catch {
        // Full or blocked: this photo is just not kept.
      }
    },
  };
}

let shared: ReadCache | null = null;

/** One cache for the client core and HttpClient alike. */
export function mobileReadCache(): ReadCache {
  return (shared ??= indexedDbReadCache());
}
