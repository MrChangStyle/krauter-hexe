import { describe, expect, it } from "vitest";
import type { DeviceStore, MoveBatch } from "@/lib/move";
import { MoveAccountError, pickUpParcels, uploadDeviceData, waitingEntries, type Fetch } from "@/lib/move-account";

const IMG = (n: number) => `data:image/jpeg;base64,${"A".repeat(n)}`;

function memoryStore(images: Record<string, string> = {}) {
  const map = new Map(Object.entries(images));
  const local = new Map<string, string>();
  const store: DeviceStore = {
    listImageIds: async () => [...map.keys()],
    getImage: async (id) => map.get(id) ?? null,
    hasImage: async (id) => map.has(id),
    putImage: async (id, url) => void map.set(id, url),
    getQueue: async () => [],
    hasQueueItem: async () => false,
    putQueueItem: async () => undefined,
    getDraft: async () => null,
    putDraft: async () => undefined,
    getLocal: (k) => local.get(k) ?? null,
    setLocal: (k, v) => void local.set(k, v),
  };
  return { store, map };
}

/** The server's move routes, in memory. */
function fakeServer(signedIn = true) {
  const parcels: { id: number; entries: number; batch: MoveBatch }[] = [];
  let nextId = 1;
  const fetchFn: Fetch = async (url, init) => {
    if (!signedIn) return new Response(null, { status: 401 });
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/move/parcels") && method === "DELETE") {
      parcels.length = 0;
      return new Response(null, { status: 204 });
    }
    if (url.endsWith("/api/move/parcels") && method === "POST") {
      const body = JSON.parse(String(init!.body)) as { batch: MoveBatch; entries: number };
      parcels.push({ id: nextId++, ...body });
      return Response.json({}, { status: 201 });
    }
    if (url.endsWith("/api/move/status")) {
      return Response.json({ parcels: parcels.length, entries: parcels.reduce((s, p) => s + p.entries, 0) });
    }
    const after = Number(new URL(url, "http://x").searchParams.get("after"));
    const next = parcels.find((p) => p.id > after);
    return next ? Response.json(next) : new Response(null, { status: 204 });
  };
  return { fetchFn, parcels };
}

describe("Umzug über das Konto", () => {
  it("uploads all photos in parcels and picks them up at the new address", async () => {
    const server = fakeServer();
    const old = memoryStore(Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`img${i}`, IMG(10 + i)])));
    const seen: number[] = [];
    const sent = await uploadDeviceData({ store: old.store, fetchFn: server.fetchFn, onProgress: (p) => seen.push(p.done) });
    expect(sent).toEqual({ done: 7, total: 7 });
    expect(seen).toEqual([0, 0, 3, 6, 7]);
    expect(await waitingEntries(server.fetchFn)).toEqual({ parcels: 4, entries: 7 });

    // A second upload starts over instead of doubling.
    await uploadDeviceData({ store: old.store, fetchFn: server.fetchFn });
    expect(server.parcels).toHaveLength(4);

    const fresh = memoryStore({ img0: IMG(10) });
    const progress: number[] = [];
    const stored = await pickUpParcels({ total: 7, store: fresh.store, fetchFn: server.fetchFn, onProgress: (p) => progress.push(p.done) });
    expect(stored.images).toBe(6);
    expect(fresh.map.size).toBe(7);
    expect(progress).toEqual([0, 3, 6, 7]);
    expect(server.parcels).toHaveLength(0);
  });

  it("says when the old address is not signed in", async () => {
    const err = await uploadDeviceData({ store: memoryStore({ a: IMG(3) }).store, fetchFn: fakeServer(false).fetchFn }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MoveAccountError);
    expect((err as MoveAccountError).notSignedIn).toBe(true);
    expect(await waitingEntries(fakeServer(false).fetchFn)).toEqual({ parcels: 0, entries: 0 });
  });
});
