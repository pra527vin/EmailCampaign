/**
 * A very small IndexedDB key/value store, with a localStorage stand-in.
 *
 * IndexedDB is blocked outright in some private windows and hardened browsers.
 * Rather than let a composed design simply vanish there, every operation falls
 * back to localStorage -- smaller and synchronous, but present everywhere.
 * Nothing here ever throws at the caller: a failed write returns `false` and
 * the editor shows that in its save indicator.
 */

const DB_NAME = 'mailstrive-compose';
const DB_VERSION = 1;
const STORE = 'documents';
const FALLBACK_PREFIX = 'mailstrive-compose:';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('no indexedDB'));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('indexedDB blocked'));
  }).catch((error: unknown) => {
    // Cleared so a later call can retry rather than inheriting the rejection.
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = fn(tx.objectStore(STORE));
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

const local = {
  get(key: string): unknown {
    const raw = window.localStorage.getItem(FALLBACK_PREFIX + key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  },
  set(key: string, value: unknown): void {
    window.localStorage.setItem(FALLBACK_PREFIX + key, JSON.stringify(value));
  },
  del(key: string): void {
    window.localStorage.removeItem(FALLBACK_PREFIX + key);
  },
};

export async function idbGet(key: string): Promise<unknown> {
  try {
    return await run<unknown>('readonly', (store) => store.get(key));
  } catch {
    try {
      return local.get(key);
    } catch {
      return undefined;
    }
  }
}

export async function idbSet(key: string, value: unknown): Promise<boolean> {
  try {
    await run('readwrite', (store) => store.put(value, key));
    return true;
  } catch {
    try {
      local.set(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(key));
  } catch {
    // Fall through: the stand-in below may still hold a copy.
  }
  try {
    local.del(key);
  } catch {
    // Nothing left to clean up.
  }
}
