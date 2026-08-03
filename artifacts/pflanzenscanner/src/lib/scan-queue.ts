// IndexedDB-backed queue for plant photos that could not be scanned right away
// (device offline / server unreachable). Items are stored locally and drained
// automatically once the device is back online - see scan-queue-context.tsx.
//
// We use IndexedDB (not localStorage) because captured photos are stored as
// data URLs and easily exceed the ~5 MB localStorage budget.
//
// Persisted status is only ever "pending" or "error". The "scanning" state is
// kept in memory by the queue context, never written here - so a tab that is
// closed mid-scan simply leaves the item "pending" and it is retried on the
// next run, instead of being stranded in a "scanning" state forever.

export type PendingScanStatus = "pending" | "scanning" | "error";

export interface PendingScan {
  id: string;
  /** The captured photo as a data URL. */
  image: string;
  /**
   * Optional second photo (data URL) - the side view of the two-photo
   * mushroom scan (Bild 1: von oben, Bild 2: von der Seite). Sent to the API
   * as `imageSide` so edibility can be verified from both views.
   */
  imageSide?: string;
  /**
   * Client-generated UUID identifying the photo in the local IndexedDB image
   * store (see image-store.ts). For new scans this is always set; for legacy
   * queue items already in storage it may be absent — the drain falls back to
   * sending only the image bytes in that case.
   */
  localImageId?: string;
  /**
   * Derived key for the side-view photo stored in the same IndexedDB
   * image store. Conventionally `${localImageId}-side`. Only meaningful
   * when localImageId is set and a side image was captured.
   * Not stored explicitly — the queue item carries localImageId and the
   * drain infers the side key if needed.
   */
  hasSideImage?: boolean;
  /** Epoch milliseconds when the photo was captured. */
  createdAt: number;
  status: PendingScanStatus;
  /** Last error message, set when status === "error". */
  error?: string;
  attempts: number;
  /**
   * True when the last failure was transient (server 5xx / AI hiccup) and the
   * queue may retry it automatically. False for permanent failures (e.g. an
   * invalid image) that need the user to retry or delete manually.
   */
  autoRetry?: boolean;
  /**
   * Epoch ms of the most recent failed attempt. Used by the queue's watchdog to
   * decide when an item that exhausted its automatic attempts may be revived
   * for another round, instead of waiting for a manual retry forever.
   */
  lastAttemptAt?: number;
  /**
   * How many times the watchdog has already revived this item after it used up
   * its automatic attempts. Capped by MAX_AUTO_REVIVALS so a permanently broken
   * photo cannot keep eating the user's daily scan quota. A manual retry resets
   * this to 0.
   */
  revivals?: number;
  /**
   * Epoch ms before which this item must not be attempted again. Set on every
   * failure from the back-off schedule below. Without it the 5-second drain
   * interval would spend every allowed attempt - and every AI call it costs -
   * within half a minute of the first failure.
   */
  nextAttemptAt?: number;
  /**
   * Optional coarse location region (e.g. "München") derived from the user's
   * GPS coordinates at scan time. Plain text only — no coordinates stored.
   */
  locationRegion?: string;
}

/**
 * How long an item that burned through MAX_AUTO_ATTEMPTS must rest before the
 * watchdog revives it for another round of automatic attempts. Long enough that
 * a permanently-broken photo can't loop on the API, short enough that a
 * transient outage (server cold start, expired session, exhausted daily quota)
 * heals itself without the user pressing anything.
 */
export const AUTO_RESTART_BACKOFF_MS = 10 * 60 * 1_000;

/**
 * How many times the watchdog may revive one item on its own. The daily scan
 * quota is a finite shared resource, so unattended retrying has to stop at some
 * point and leave the decision to the user via the manual retry button.
 */
export const MAX_AUTO_REVIVALS = 2;

/**
 * Wait time before the next automatic attempt, indexed by the number of
 * attempts already used. Deliberately steep: a transient hiccup (server cold
 * start) heals within the first 30 seconds, while a photo that fails for a
 * structural reason is only retried a handful of times per hour instead of
 * every 5 seconds.
 */
export const RETRY_BACKOFF_MS = [30 * 1_000, 2 * 60 * 1_000, 8 * 60 * 1_000];

/** Back-off to apply after `attempts` failed attempts (1-based). */
export function retryBackoffMs(attempts: number): number {
  const capped = Math.min(Math.max(attempts, 1), RETRY_BACKOFF_MS.length);
  return RETRY_BACKOFF_MS[capped - 1]!;
}

/**
 * Whether a failed item has served its back-off and may be attempted again.
 * Items written by an older app version carry no nextAttemptAt and are due
 * immediately, so an upgrade never strands a queued photo.
 */
export function isRetryDue(item: PendingScan, now: number): boolean {
  return item.nextAttemptAt == null || item.nextAttemptAt <= now;
}

/**
 * How old a queued photo must be before the UI shows a "still waiting" warning.
 * Adjust this single constant to change the threshold across the whole app.
 * Default: 24 hours.
 */
export const STALE_QUEUE_WARNING_MS = 24 * 60 * 60 * 1_000;

const DB_NAME = "pflanzenscanner";
// v2 adds the "mushroomDraft" store: Bild 1 of the two-photo mushroom scan is
// persisted between the two captures, so it survives the page reload that
// low-memory phones do right after the camera closes.
const DB_VERSION = 2;
const STORE = "pendingScans";
const DRAFT_STORE = "mushroomDraft";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB konnte nicht geöffnet werden."));
  });
  return dbPromise;
}

function store(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  name: string = STORE,
): IDBObjectStore {
  return db.transaction(name, mode).objectStore(name);
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addPendingScan(
  image: string,
  imageSide?: string,
  localImageId?: string,
  locationRegion?: string,
): Promise<PendingScan> {
  const db = await openDb();
  const item: PendingScan = {
    id: crypto.randomUUID(),
    image,
    ...(imageSide ? { imageSide } : {}),
    ...(localImageId ? { localImageId } : {}),
    ...(localImageId && imageSide ? { hasSideImage: true } : {}),
    ...(locationRegion ? { locationRegion } : {}),
    createdAt: Date.now(),
    status: "pending",
    attempts: 0,
  };
  await promisify(store(db, "readwrite").add(item));
  return item;
}

export async function getAllPendingScans(): Promise<PendingScan[]> {
  const db = await openDb();
  const items = await promisify(
    store(db, "readonly").getAll() as IDBRequest<PendingScan[]>,
  );
  return (
    items
      // A persisted "scanning" status can only be a leftover from a run that was
      // interrupted mid-scan (tab closed / crash / old app version). We never
      // depend on persisted "scanning", so surface it as "pending" - the photo
      // gets retried and is never stuck.
      .map((i) =>
        i.status === "scanning" ? { ...i, status: "pending" as const } : i,
      )
      // Oldest first, so the queue drains in capture order.
      .sort((a, b) => a.createdAt - b.createdAt)
  );
}

export async function getPendingScan(
  id: string,
): Promise<PendingScan | undefined> {
  const db = await openDb();
  return promisify(
    store(db, "readonly").get(id) as IDBRequest<PendingScan | undefined>,
  );
}

export async function putPendingScan(item: PendingScan): Promise<void> {
  const db = await openDb();
  await promisify(store(db, "readwrite").put(item));
}

// Atomically flag an item as errored, but only if it still exists. The get and
// the put happen inside a single readwrite transaction, so an item removed
// concurrently (e.g. from another tab) between the two can't be recreated by
// this write. Resolves to true if the item existed and was updated.
export async function markScanError(
  id: string,
  message: string,
  autoRetry: boolean,
): Promise<boolean> {
  const db = await openDb();
  return new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const objStore = tx.objectStore(STORE);
    const getReq = objStore.get(id) as IDBRequest<PendingScan | undefined>;
    let existed = false;
    getReq.onsuccess = () => {
      const item = getReq.result;
      if (item) {
        existed = true;
        const now = Date.now();
        const attempts = item.attempts + 1;
        objStore.put({
          ...item,
          status: "error",
          error: message,
          attempts,
          autoRetry,
          lastAttemptAt: now,
          // Make the next attempt wait. Applied even for permanent failures so
          // a manual retry that fails again cannot spin either.
          nextAttemptAt: now + retryBackoffMs(attempts),
        });
      }
    };
    tx.oncomplete = () => resolve(existed);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Atomically put an item back into the "pending" state with a clean slate:
 * the attempt counter is reset to 0 and the previous error is dropped, so the
 * drain treats it like a freshly captured photo. Used both by the manual retry
 * button and by the watchdog that revives items whose automatic attempts ran
 * out. Resolves to true if the item still existed and was reset.
 */
export async function resetPendingScan(
  id: string,
  options: { countAsRevival?: boolean } = {},
): Promise<boolean> {
  const db = await openDb();
  return new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const objStore = tx.objectStore(STORE);
    const getReq = objStore.get(id) as IDBRequest<PendingScan | undefined>;
    let existed = false;
    getReq.onsuccess = () => {
      const item = getReq.result;
      if (item) {
        existed = true;
        objStore.put({
          ...item,
          status: "pending",
          error: undefined,
          attempts: 0,
          autoRetry: undefined,
          lastAttemptAt: undefined,
          // The rest has been served (watchdog) or the user is explicitly asking
          // for it now (manual retry), so this item is due immediately.
          nextAttemptAt: undefined,
          // An unattended revival is counted so the watchdog eventually gives
          // up; an explicit manual retry wipes the counter and grants a fresh
          // set of automatic rounds.
          revivals: options.countAsRevival ? (item.revivals ?? 0) + 1 : 0,
        });
      }
    };
    tx.oncomplete = () => resolve(existed);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Items whose automatic attempts ran out but that have rested long enough and
 * have revival rounds left. Pure filter over a queue snapshot so the watchdog
 * logic stays unit-testable.
 */
export function findRevivableScans(
  items: PendingScan[],
  now: number,
  maxAutoAttempts: number,
): PendingScan[] {
  return items.filter(
    (i) =>
      i.status === "error" &&
      // Only transient failures are worth an unattended second chance; a
      // permanent 4xx would fail identically no matter how long we wait.
      i.autoRetry === true &&
      i.attempts >= maxAutoAttempts &&
      (i.revivals ?? 0) < MAX_AUTO_REVIVALS &&
      now - (i.lastAttemptAt ?? i.createdAt) >= AUTO_RESTART_BACKOFF_MS,
  );
}

export async function deletePendingScan(id: string): Promise<void> {
  const db = await openDb();
  await promisify(store(db, "readwrite").delete(id));
}

// --- Mushroom two-photo draft -----------------------------------------------
// Bild 1 (von oben) of the Pilz-Scan, persisted between the two captures. At
// most one draft exists at a time (fixed key). The scan page restores it on
// mount, so a page reload between the two photos never loses the first one.

export interface MushroomDraft {
  /** Fixed key - at most one draft exists at a time. */
  id: "draft";
  /** Bild 1 (von oben) as a data URL. */
  image: string;
  /** Epoch milliseconds when Bild 1 was captured. */
  createdAt: number;
}

export async function getMushroomDraft(): Promise<MushroomDraft | undefined> {
  const db = await openDb();
  return promisify(
    store(db, "readonly", DRAFT_STORE).get(
      "draft",
    ) as IDBRequest<MushroomDraft | undefined>,
  );
}

export async function putMushroomDraft(image: string): Promise<void> {
  const db = await openDb();
  const draft: MushroomDraft = { id: "draft", image, createdAt: Date.now() };
  await promisify(store(db, "readwrite", DRAFT_STORE).put(draft));
}

export async function clearMushroomDraft(): Promise<void> {
  const db = await openDb();
  await promisify(store(db, "readwrite", DRAFT_STORE).delete("draft"));
}

// A thrown request error is a *network* failure (device offline / server
// unreachable) unless it is one of the client's structured errors, which mean
// the server actually responded. We duck-type by `name` so this stays decoupled
// from the generated client's internals (ApiError / ResponseParseError).
export function isNetworkError(err: unknown): boolean {
  const name = (err as { name?: string } | null | undefined)?.name;
  return name !== "ApiError" && name !== "ResponseParseError";
}
