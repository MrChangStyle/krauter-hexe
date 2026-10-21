/**
 * Umzug über das Konto (docs/landingpage.md): the old address uploads this
 * device's photos and scan queue as parcels to the server, the new address
 * fetches them after signing in. No second window needed – this works in
 * installed apps on Android and iPhone, where two windows cannot talk.
 */

import {
  NO_COUNTS,
  addCounts,
  applyMoveBatch,
  batchEntries,
  browserDeviceStore,
  countDeviceData,
  packDeviceData,
  type DeviceStore,
  type MoveBatch,
  type MoveCounts,
  type MoveProgress,
} from "@/lib/move";

/** Few photos per parcel: each one is a request of its own. */
const PHOTOS_PER_PARCEL = 3;

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const base = () => (import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "");

export class MoveAccountError extends Error {
  constructor(
    message: string,
    readonly notSignedIn = false,
  ) {
    super(message);
  }
}

async function errorOf(res: Response): Promise<MoveAccountError> {
  if (res.status === 401 || res.status === 403) {
    return new MoveAccountError("Du bist hier nicht angemeldet. Nutze bitte „Als Datei sichern“.", true);
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return new MoveAccountError(data?.error ?? "Die Fotos konnten nicht hochgeladen werden. Bist du online?");
}

/** Old address: uploads everything. Starts over cleanly, so a second try never doubles. */
export async function uploadDeviceData(options: {
  onProgress?: (progress: MoveProgress) => void;
  store?: DeviceStore;
  fetchFn?: Fetch;
} = {}): Promise<MoveProgress> {
  const { onProgress, store = browserDeviceStore, fetchFn = fetch } = options;
  const counts = await countDeviceData(store);
  const progress: MoveProgress = { done: 0, total: counts.images + counts.queue + counts.draft };
  onProgress?.({ ...progress });
  const cleared = await fetchFn(`${base()}/api/move/parcels`, { method: "DELETE", credentials: "include" });
  if (!cleared.ok) throw await errorOf(cleared);
  for await (const batch of packDeviceData(store, PHOTOS_PER_PARCEL)) {
    const entries = batchEntries(batch);
    const res = await fetchFn(`${base()}/api/move/parcels`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch, entries }),
    });
    if (!res.ok) throw await errorOf(res);
    progress.done = Math.min(progress.total, progress.done + entries);
    onProgress?.({ ...progress });
  }
  return progress;
}

/** New address: how many entries wait on the server (0 = nothing to pick up). */
export async function waitingEntries(fetchFn: Fetch = fetch): Promise<{ parcels: number; entries: number }> {
  const res = await fetchFn(`${base()}/api/move/status`, { credentials: "include", cache: "no-store" });
  if (!res.ok) return { parcels: 0, entries: 0 };
  const data = (await res.json()) as { parcels?: number; entries?: number };
  return { parcels: Number(data.parcels) || 0, entries: Number(data.entries) || 0 };
}

/**
 * New address: stores every parcel on this device, then deletes them on the
 * server. Safe to repeat – nothing already here is overwritten.
 */
export async function pickUpParcels(options: {
  total: number;
  onProgress?: (progress: MoveProgress, stored: MoveCounts) => void;
  store?: DeviceStore;
  fetchFn?: Fetch;
}): Promise<MoveCounts> {
  const { total, onProgress, store = browserDeviceStore, fetchFn = fetch } = options;
  let stored = NO_COUNTS;
  const progress: MoveProgress = { done: 0, total };
  let after = 0;
  for (;;) {
    const res = await fetchFn(`${base()}/api/move/parcels/next?after=${after}`, { credentials: "include", cache: "no-store" });
    if (res.status === 204) break;
    if (!res.ok) throw new MoveAccountError("Die Fotos konnten nicht abgeholt werden. Bist du online?");
    const parcel = (await res.json()) as { id: number; entries: number; batch: MoveBatch };
    stored = addCounts(stored, await applyMoveBatch(parcel.batch, store));
    progress.done = Math.min(progress.total, progress.done + (Number(parcel.entries) || 0));
    onProgress?.({ ...progress }, stored);
    after = parcel.id;
  }
  await fetchFn(`${base()}/api/move/parcels`, { method: "DELETE", credentials: "include" });
  return stored;
}
