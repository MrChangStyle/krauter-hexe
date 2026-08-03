/**
 * Local-first image store backed by IndexedDB.
 *
 * New scans store their compressed JPEG here under a client-generated UUID
 * (localImageId). The server stores only the UUID; the actual photo bytes
 * never leave the device after the initial AI-identification request.
 *
 * Uses a dedicated IndexedDB database ("pflanzenscanner-images") separate
 * from the scan-queue database so schema migrations in one do not affect the
 * other.
 */

const DB_NAME = "pflanzenscanner-images";
const DB_VERSION = 1;
const STORE = "images";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("Bildspeicher konnte nicht geöffnet werden."));
  });
  return dbPromise;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface ImageRecord {
  id: string;
  dataUrl: string;
  createdAt: number;
}

/**
 * Store a data URL under the given localImageId key.
 * Overwrites any existing record with the same id (idempotent).
 */
export async function putImage(localImageId: string, dataUrl: string): Promise<void> {
  const db = await openDb();
  const record: ImageRecord = { id: localImageId, dataUrl, createdAt: Date.now() };
  await promisify(
    db.transaction(STORE, "readwrite").objectStore(STORE).put(record),
  );
}

/**
 * Retrieve the data URL for a given localImageId.
 * Returns null when no image is found (e.g. after a cache clear).
 */
export async function getImage(localImageId: string): Promise<string | null> {
  try {
    const db = await openDb();
    const record = await promisify(
      db.transaction(STORE, "readonly").objectStore(STORE).get(localImageId) as IDBRequest<
        ImageRecord | undefined
      >,
    );
    return record?.dataUrl ?? null;
  } catch {
    // IndexedDB unavailable (private browsing mode, storage full, etc.)
    return null;
  }
}

/**
 * Delete the image for a given localImageId.
 * Safe to call when the id does not exist.
 */
export async function deleteImage(localImageId: string): Promise<void> {
  try {
    const db = await openDb();
    await promisify(
      db.transaction(STORE, "readwrite").objectStore(STORE).delete(localImageId),
    );
  } catch {
    // Ignore errors on delete (best-effort cleanup)
  }
}
