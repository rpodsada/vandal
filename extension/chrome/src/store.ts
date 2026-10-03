// Captures waiting in the extension's IndexedDB (PLAN 3N). The service worker
// can be stopped at any time, so the image is stored before the result tab
// opens, and stays for a day so a reopened tab (Ctrl+Shift+T) still works.

export interface Capture {
  id: string;
  blob: Blob;
  /** Image size in device pixels. */
  width: number;
  height: number;
  url: string;
  title: string;
  /** When it was captured (ms since the epoch). */
  created: number;
}

const DB = "vandal";
const STORE = "captures";
const KEEP_MS = 24 * 60 * 60 * 1000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function putCapture(capture: Capture): Promise<void> {
  await run("readwrite", (store) => store.put(capture));
}

export async function getCapture(id: string): Promise<Capture | undefined> {
  return run<Capture>("readonly", (store) => store.get(id));
}

/** Delete captures older than a day. */
export async function prune(now = Date.now()): Promise<void> {
  await run("readwrite", (store) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if (now - (cursor.value as Capture).created > KEEP_MS) cursor.delete();
      cursor.continue();
    };
  });
}
