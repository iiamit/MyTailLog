// ===========================================================================
// Offline capture queue — IndexedDB.
//
// Hangars have poor signal (see plan). A captured page is written here FIRST,
// as a Blob plus its metadata, so it survives reloads and network drops. The
// uploader (see uploader.ts) drains this store to Supabase whenever a client is
// online. IndexedDB is used rather than the Cache API because these are
// user-authored records with structured metadata, not cached HTTP responses.
// ===========================================================================

const DB_NAME = "mytaillog-capture";
const DB_VERSION = 1;
const STORE = "pending";

/** A page photographed but not yet uploaded. */
export type QueuedPage = {
  /** Client-generated uuid — also becomes the page row id and storage key. */
  id: string;
  aircraftId: string;
  logbookId: string;
  /** Human label for the logbook, e.g. "Airframe" — for queue display only. */
  logbookLabel: string;
  /** Order within the capture session; may be null if the user skipped it. */
  pageSequence: number | null;
  /** ISO timestamp of when the shot was taken. */
  capturedAt: string;
  /** Capture-app flag routing this page to the vision-LLM pipeline later. */
  isHandwritten: boolean;
  /** Processed (cropped/deskewed) JPEG blob ready to upload. */
  blob: Blob;
  /** Small JPEG thumbnail derived from the same image, uploaded alongside. */
  thumbnailBlob: Blob;
  width: number;
  height: number;
  /** Quality metrics kept for later triage / debugging. */
  sharpness: number;
  glareRatio: number;
  createdAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

export async function enqueuePage(page: QueuedPage): Promise<void> {
  await tx("readwrite", (store) => store.put(page));
}

export async function listQueued(): Promise<QueuedPage[]> {
  const all = await tx<QueuedPage[]>("readonly", (store) => store.getAll());
  // Oldest first, so uploads preserve capture order.
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function countQueued(): Promise<number> {
  return tx<number>("readonly", (store) => store.count());
}

export async function removeQueued(id: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(id));
}
