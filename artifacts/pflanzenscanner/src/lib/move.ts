/**
 * Moving device data to the new address (Little Farming, littlefarming.de).
 *
 * Browsers keep IndexedDB and localStorage per address (origin). Photos that
 * exist only on this device – the scan queue, an unfinished mushroom scan and
 * the photos behind "Meine Scans" – would stay behind at the old address. This
 * module packs them on the old address and unpacks them on the new one, either
 * window-to-window (postMessage) or through a file.
 *
 * Unpacking never overwrites: data already present at the new address wins.
 * Nothing is deleted at the old address.
 */

import {
  getAllPendingScans,
  getMushroomDraft,
  getPendingScan,
  putMushroomDraft,
  putPendingScan,
  type PendingScan,
} from "@/lib/scan-queue";
import { getImage, hasImage, listImageIds, putImage } from "@/lib/image-store";

export const MOVE_PROTOCOL = "lf-move/1";
export const MOVE_FILE_FORMAT = "little-farming-umzug";
export const MOVED_FLAG_KEY = "lf-moved-to";

/** localStorage entries that travel along. */
export const MOVED_LOCAL_KEYS = ["lf-my-photos-v1", "legacy-image-migration-done-v1"] as const;

const MAX_DATA_URL_LENGTH = 15 * 1024 * 1024;
const QUEUE_KINDS = new Set(["plant", "insect", "auto"]);
const QUEUE_STATUSES = new Set(["pending", "scanning", "error"]);

export interface MovedImage {
  id: string;
  dataUrl: string;
}

export interface MoveBatch {
  images?: MovedImage[];
  queue?: PendingScan[];
  draft?: string | null;
  local?: Record<string, string>;
}

/** How far a move is: entries (photos, queue items, draft) handed over of all. */
export interface MoveProgress {
  done: number;
  total: number;
}

/** Entries in one batch that count for the progress (the small local keys do not). */
export function batchEntries(batch: MoveBatch): number {
  return (Array.isArray(batch.images) ? batch.images.length : 0) + (Array.isArray(batch.queue) ? batch.queue.length : 0) + (batch.draft ? 1 : 0);
}

/** 0–100; an empty move is complete. */
export function movePercent(progress: MoveProgress): number {
  if (progress.total <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((progress.done / progress.total) * 100)));
}

export interface MoveCounts {
  images: number;
  queue: number;
  draft: number;
  local: number;
}

export const NO_COUNTS: MoveCounts = { images: 0, queue: 0, draft: 0, local: 0 };

export function addCounts(a: MoveCounts, b: MoveCounts): MoveCounts {
  return {
    images: a.images + b.images,
    queue: a.queue + b.queue,
    draft: a.draft + b.draft,
    local: a.local + b.local,
  };
}

// ── Validation (the receiver trusts nothing) ────────────────────────────────

function isImageDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("data:image/") &&
    value.length <= MAX_DATA_URL_LENGTH
  );
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

export function validImage(value: unknown): MovedImage | null {
  const v = value as Partial<MovedImage> | null;
  if (!v || !isId(v.id) || !isImageDataUrl(v.dataUrl)) return null;
  return { id: v.id, dataUrl: v.dataUrl };
}

export function validQueueItem(value: unknown): PendingScan | null {
  const v = value as Partial<PendingScan> | null;
  if (!v || !isId(v.id) || !isImageDataUrl(v.image)) return null;
  if (typeof v.createdAt !== "number" || !Number.isFinite(v.createdAt)) return null;
  if (typeof v.status !== "string" || !QUEUE_STATUSES.has(v.status)) return null;
  if (v.kind !== undefined && !QUEUE_KINDS.has(v.kind)) return null;
  if (v.imageSide !== undefined && !isImageDataUrl(v.imageSide)) return null;
  if (v.localImageId !== undefined && !isId(v.localImageId)) return null;
  return {
    ...v,
    // A scan that was running when the data was packed is simply retried.
    status: v.status === "scanning" ? "pending" : v.status,
    attempts: typeof v.attempts === "number" ? v.attempts : 0,
  } as PendingScan;
}

/**
 * Merges the "Meine Scans" photo mapping. Entries already present at the new
 * address win; choices are combined without duplicates.
 */
export function mergeMyPhotos(existingRaw: string | null, incomingRaw: string): string {
  type Store = { photos: Record<string, string>; choices: Array<{ kind: string; id: number }> };
  const parse = (raw: string | null): Store => {
    try {
      const v = raw ? (JSON.parse(raw) as Partial<Store>) : {};
      return {
        photos: v.photos && typeof v.photos === "object" ? v.photos : {},
        choices: Array.isArray(v.choices) ? v.choices : [],
      };
    } catch {
      return { photos: {}, choices: [] };
    }
  };
  const existing = parse(existingRaw);
  const incoming = parse(incomingRaw);
  const photos = { ...incoming.photos, ...existing.photos };
  const seen = new Set(existing.choices.map((c) => `${c.kind}:${c.id}`));
  const choices = [
    ...existing.choices,
    ...incoming.choices.filter((c) => !seen.has(`${c.kind}:${c.id}`)),
  ];
  return JSON.stringify({ photos, choices });
}

// ── Device access (replaceable in tests) ────────────────────────────────────

export interface DeviceStore {
  listImageIds(): Promise<string[]>;
  getImage(id: string): Promise<string | null>;
  hasImage(id: string): Promise<boolean>;
  putImage(id: string, dataUrl: string): Promise<void>;
  getQueue(): Promise<PendingScan[]>;
  hasQueueItem(id: string): Promise<boolean>;
  putQueueItem(item: PendingScan): Promise<void>;
  getDraft(): Promise<string | null>;
  putDraft(image: string): Promise<void>;
  getLocal(key: string): string | null;
  setLocal(key: string, value: string): void;
}

export const browserDeviceStore: DeviceStore = {
  listImageIds,
  getImage,
  hasImage,
  putImage,
  getQueue: () => getAllPendingScans().catch(() => []),
  hasQueueItem: async (id) => !!(await getPendingScan(id).catch(() => undefined)),
  putQueueItem: putPendingScan,
  getDraft: async () => (await getMushroomDraft().catch(() => undefined))?.image ?? null,
  putDraft: putMushroomDraft,
  getLocal: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setLocal: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage blocked: nothing we can do */
    }
  },
};

// ── Packing (old address) ───────────────────────────────────────────────────

/** What would move, without loading image bytes. */
export async function countDeviceData(store: DeviceStore = browserDeviceStore): Promise<MoveCounts> {
  const [imageIds, queue, draft] = await Promise.all([
    store.listImageIds(),
    store.getQueue(),
    store.getDraft(),
  ]);
  return {
    images: imageIds.length,
    queue: queue.length,
    draft: draft ? 1 : 0,
    local: MOVED_LOCAL_KEYS.filter((key) => store.getLocal(key) !== null).length,
  };
}

/**
 * Yields the device data in batches small enough for one postMessage each:
 * first queue, draft and local entries, then the images a few at a time.
 */
export async function* packDeviceData(
  store: DeviceStore = browserDeviceStore,
  imagesPerBatch = 10,
): AsyncGenerator<MoveBatch> {
  const local: Record<string, string> = {};
  for (const key of MOVED_LOCAL_KEYS) {
    const value = store.getLocal(key);
    if (value !== null) local[key] = value;
  }
  yield { queue: await store.getQueue(), draft: await store.getDraft(), local };

  const ids = await store.listImageIds();
  for (let i = 0; i < ids.length; i += imagesPerBatch) {
    const images: MovedImage[] = [];
    for (const id of ids.slice(i, i + imagesPerBatch)) {
      const dataUrl = await store.getImage(id);
      if (dataUrl) images.push({ id, dataUrl });
    }
    yield { images };
  }
}

// ── Unpacking (new address) ─────────────────────────────────────────────────

/**
 * Stores one batch. Invalid entries are skipped; existing data is never
 * overwritten. Returns how many entries were newly stored.
 */
export async function applyMoveBatch(
  batch: MoveBatch,
  store: DeviceStore = browserDeviceStore,
): Promise<MoveCounts> {
  const counts = { ...NO_COUNTS };

  for (const raw of Array.isArray(batch.images) ? batch.images : []) {
    const image = validImage(raw);
    if (!image || (await store.hasImage(image.id))) continue;
    await store.putImage(image.id, image.dataUrl);
    counts.images += 1;
  }

  for (const raw of Array.isArray(batch.queue) ? batch.queue : []) {
    const item = validQueueItem(raw);
    if (!item || (await store.hasQueueItem(item.id))) continue;
    await store.putQueueItem(item);
    counts.queue += 1;
  }

  if (isImageDataUrl(batch.draft) && !(await store.getDraft())) {
    await store.putDraft(batch.draft);
    counts.draft = 1;
  }

  if (batch.local && typeof batch.local === "object") {
    for (const key of MOVED_LOCAL_KEYS) {
      const value = (batch.local as Record<string, unknown>)[key];
      if (typeof value !== "string" || value.length > 1_000_000) continue;
      const existing = store.getLocal(key);
      if (key === "lf-my-photos-v1") {
        store.setLocal(key, mergeMyPhotos(existing, value));
        counts.local += 1;
      } else if (existing === null) {
        store.setLocal(key, value);
        counts.local += 1;
      }
    }
  }

  return counts;
}

// ── File variant ────────────────────────────────────────────────────────────

export interface MoveFile extends MoveBatch {
  format: typeof MOVE_FILE_FORMAT;
  version: 1;
  createdAt: string;
  from: string;
}

/** All device data as one file (for devices where windows cannot talk). */
export async function buildMoveFile(store: DeviceStore = browserDeviceStore): Promise<Blob> {
  const file: MoveFile = {
    format: MOVE_FILE_FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    from: typeof location !== "undefined" ? location.origin : "",
    images: [],
    queue: [],
    draft: null,
    local: {},
  };
  for await (const batch of packDeviceData(store, 50)) {
    if (batch.images) file.images!.push(...batch.images);
    if (batch.queue) file.queue = batch.queue;
    if (batch.draft !== undefined) file.draft = batch.draft;
    if (batch.local) file.local = batch.local;
  }
  return new Blob([JSON.stringify(file)], { type: "application/json" });
}

/** Reads a move file; throws a German message when it is not one. */
export async function readMoveFile(text: string): Promise<MoveBatch> {
  let data: Partial<MoveFile>;
  try {
    data = JSON.parse(text) as Partial<MoveFile>;
  } catch {
    throw new Error("Diese Datei kann nicht gelesen werden.");
  }
  if (data.format !== MOVE_FILE_FORMAT || data.version !== 1) {
    throw new Error("Das ist keine Umzugsdatei von Little Farming.");
  }
  return { images: data.images, queue: data.queue, draft: data.draft, local: data.local };
}
