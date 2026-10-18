/**
 * "Meine Scans" keeps one photo per species on this device: the user's own
 * photo, independent of the shared gallery photo.
 *
 * - First scan of a species: the photo becomes the user's photo.
 * - Repeat scan: the user chooses between the old and the new photo; the
 *   one not chosen is deleted from the device to keep storage low.
 *
 * The mapping (species → local image key) is small and lives in
 * localStorage; the images themselves stay in the IndexedDB image store.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { deleteImage, getImage, hasImage } from "@/lib/image-store";

export type PhotoKind = "plant" | "insect";

export interface PhotoChoice {
  kind: PhotoKind;
  id: number;
  oldLocalId: string;
  newLocalId: string;
  createdAt: number;
}

interface Store {
  photos: Record<string, string>;
  choices: PhotoChoice[];
}

const STORAGE_KEY = "lf-my-photos-v1";
const EVENT = "lf-my-photos-changed";

function keyOf(kind: PhotoKind, id: number): string {
  return `${kind}:${id}`;
}

let cache: Store | null = null;
let cacheRaw: string | null = null;

function read(): Store {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (cache && raw === cacheRaw) return cache;
  let parsed: Store = { photos: {}, choices: [] };
  if (raw) {
    try {
      const value = JSON.parse(raw) as Partial<Store>;
      parsed = {
        photos: value.photos && typeof value.photos === "object" ? value.photos : {},
        choices: Array.isArray(value.choices) ? value.choices : [],
      };
    } catch {
      /* corrupt entry: start fresh */
    }
  }
  cache = parsed;
  cacheRaw = raw;
  return parsed;
}

function write(store: Store): void {
  const raw = JSON.stringify(store);
  try {
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    /* storage full or blocked: keep working in memory */
  }
  cache = store;
  cacheRaw = raw;
  window.dispatchEvent(new Event(EVENT));
}

/** Deletes a photo and its mushroom side view from the device. */
async function deletePhoto(localId: string): Promise<void> {
  await deleteImage(localId).catch(() => {});
  await deleteImage(`${localId}-side`).catch(() => {});
}

export function getMyPhotoId(kind: PhotoKind, id: number): string | null {
  return read().photos[keyOf(kind, id)] ?? null;
}

/**
 * Called after every successful scan.
 *
 * @param fallbackOldId the shared entry's local photo key: for species
 *   scanned before this mapping existed, that is this device's old photo
 *   when it is still stored here.
 */
export async function recordScanPhoto(args: {
  kind: PhotoKind;
  id: number;
  newLocalId: string | undefined;
  fallbackOldId?: string | null;
}): Promise<void> {
  const { kind, id, newLocalId } = args;
  if (!newLocalId) return;
  const store = read();
  const key = keyOf(kind, id);
  let oldId = store.photos[key] ?? null;
  if (!oldId && args.fallbackOldId && args.fallbackOldId !== newLocalId) {
    oldId = (await hasImage(args.fallbackOldId).catch(() => false))
      ? args.fallbackOldId
      : null;
  }
  if (oldId && !(await hasImage(oldId).catch(() => false))) oldId = null;

  const fresh = read();
  if (!oldId || oldId === newLocalId) {
    write({ ...fresh, photos: { ...fresh.photos, [key]: newLocalId } });
    return;
  }
  // A choice already waiting for this species: the newer photo replaces the
  // waiting one, which is deleted (the user never chose it).
  const waiting = fresh.choices.find((c) => c.kind === kind && c.id === id);
  if (waiting && waiting.newLocalId !== newLocalId) void deletePhoto(waiting.newLocalId);
  write({
    photos: { ...fresh.photos, [key]: oldId },
    choices: [
      ...fresh.choices.filter((c) => !(c.kind === kind && c.id === id)),
      { kind, id, oldLocalId: oldId, newLocalId, createdAt: Date.now() },
    ],
  });
}

/** Keeps one of the two photos and deletes the other from the device. */
export async function resolvePhotoChoice(
  kind: PhotoKind,
  id: number,
  keep: "old" | "new",
): Promise<void> {
  const store = read();
  const choice = store.choices.find((c) => c.kind === kind && c.id === id);
  if (!choice) return;
  const keepId = keep === "old" ? choice.oldLocalId : choice.newLocalId;
  const dropId = keep === "old" ? choice.newLocalId : choice.oldLocalId;
  write({
    photos: { ...store.photos, [keyOf(kind, id)]: keepId },
    choices: store.choices.filter((c) => c !== choice),
  });
  await deletePhoto(dropId);
}

function subscribe(callback: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

/** The photo choice waiting for this species, if any. */
export function usePhotoChoice(kind: PhotoKind, id: number): PhotoChoice | null {
  const store = useSyncExternalStore(subscribe, read, read);
  return store.choices.find((c) => c.kind === kind && c.id === id) ?? null;
}

/** The user's own photo of this species as a data URL, or null. */
export function useMyPhoto(kind: PhotoKind, id: number | undefined): string | null {
  const store = useSyncExternalStore(subscribe, read, read);
  const localId = id == null ? null : (store.photos[keyOf(kind, id)] ?? null);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!localId) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    getImage(localId)
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [localId]);
  return src;
}
