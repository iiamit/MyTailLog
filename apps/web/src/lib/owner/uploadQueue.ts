// File bytes stay in IndexedDB until the original is durably stored server-side.
export type InboxUpload = {
  id: string;
  aircraftId: string;
  file: File;
  createdAt: number;
};
async function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("mtl-document-inbox", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("uploads", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function inboxUploads(): Promise<InboxUpload[]> {
  const database = await db();
  try {
    return await new Promise((resolve, reject) => {
      const request = database
        .transaction("uploads")
        .objectStore("uploads")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}
export async function saveInboxUpload(upload: InboxUpload) {
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("uploads", "readwrite");
      tx.objectStore("uploads").put(upload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}
export async function removeInboxUpload(id: string) {
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("uploads", "readwrite");
      tx.objectStore("uploads").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}
