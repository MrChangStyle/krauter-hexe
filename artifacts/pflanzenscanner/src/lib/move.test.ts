import { describe, expect, it } from "vitest";
import type { PendingScan } from "@/lib/scan-queue";
import {
  MOVE_FILE_FORMAT,
  applyMoveBatch,
  buildMoveFile,
  countDeviceData,
  mergeMyPhotos,
  packDeviceData,
  readMoveFile,
  type DeviceStore,
} from "@/lib/move";
import { receiveDeviceData, sendDeviceData, type MessagePort } from "@/lib/move-channel";

const IMG = (n: number) => `data:image/jpeg;base64,${"A".repeat(n)}`;

/** In-memory stand-in for IndexedDB + localStorage. */
function memoryStore(seed: {
  images?: Record<string, string>;
  queue?: PendingScan[];
  draft?: string | null;
  local?: Record<string, string>;
} = {}) {
  const images = new Map(Object.entries(seed.images ?? {}));
  const queue = new Map((seed.queue ?? []).map((q) => [q.id, q]));
  let draft = seed.draft ?? null;
  const local = new Map(Object.entries(seed.local ?? {}));
  const store: DeviceStore = {
    listImageIds: async () => [...images.keys()],
    getImage: async (id) => images.get(id) ?? null,
    hasImage: async (id) => images.has(id),
    putImage: async (id, dataUrl) => void images.set(id, dataUrl),
    getQueue: async () => [...queue.values()],
    hasQueueItem: async (id) => queue.has(id),
    putQueueItem: async (item) => void queue.set(item.id, item),
    getDraft: async () => draft,
    putDraft: async (image) => void (draft = image),
    getLocal: (key) => local.get(key) ?? null,
    setLocal: (key, value) => void local.set(key, value),
  };
  return { store, images, queue, local, getDraftValue: () => draft };
}

const queueItem = (id: string, extra: Partial<PendingScan> = {}): PendingScan => ({
  id,
  image: IMG(10),
  createdAt: 1_700_000_000_000,
  status: "pending",
  attempts: 0,
  ...extra,
});

describe("packing and unpacking", () => {
  it("counts what would move", async () => {
    const { store } = memoryStore({
      images: { a: IMG(5), b: IMG(5) },
      queue: [queueItem("q1")],
      draft: IMG(3),
      local: { "lf-my-photos-v1": "{}", unrelated: "x" },
    });
    expect(await countDeviceData(store)).toEqual({ images: 2, queue: 1, draft: 1, local: 1 });
  });

  it("moves everything to an empty new address", async () => {
    const source = memoryStore({
      images: { a: IMG(5), b: IMG(6), c: IMG(7) },
      queue: [queueItem("q1", { status: "scanning" }), queueItem("q2", { kind: "insect" })],
      draft: IMG(3),
      local: { "lf-my-photos-v1": JSON.stringify({ photos: { "plant:1": "a" }, choices: [] }) },
    });
    const target = memoryStore();

    for await (const batch of packDeviceData(source.store, 2)) {
      await applyMoveBatch(JSON.parse(JSON.stringify(batch)), target.store);
    }

    expect([...target.images.keys()].sort()).toEqual(["a", "b", "c"]);
    expect(target.queue.get("q1")?.status).toBe("pending"); // interrupted scan is retried
    expect(target.queue.get("q2")?.kind).toBe("insect");
    expect(target.getDraftValue()).toBe(IMG(3));
    expect(JSON.parse(target.local.get("lf-my-photos-v1")!).photos).toEqual({ "plant:1": "a" });
  });

  it("never overwrites data that already exists at the new address", async () => {
    const target = memoryStore({
      images: { a: "data:image/jpeg;base64,NEU" },
      queue: [queueItem("q1", { attempts: 2 })],
      draft: "data:image/jpeg;base64,NEUERENTWURF",
    });
    const stored = await applyMoveBatch(
      { images: [{ id: "a", dataUrl: IMG(4) }], queue: [queueItem("q1")], draft: IMG(2) },
      target.store,
    );
    expect(stored).toEqual({ images: 0, queue: 0, draft: 0, local: 0 });
    expect(target.images.get("a")).toBe("data:image/jpeg;base64,NEU");
    expect(target.queue.get("q1")?.attempts).toBe(2);
    expect(target.getDraftValue()).toBe("data:image/jpeg;base64,NEUERENTWURF");
  });

  it("skips anything that is not a photo or a valid queue item", async () => {
    const target = memoryStore();
    const stored = await applyMoveBatch(
      {
        images: [
          { id: "ok", dataUrl: IMG(3) },
          { id: "html", dataUrl: "data:text/html,<script>alert(1)</script>" },
          { id: "", dataUrl: IMG(3) },
        ],
        queue: [
          queueItem("ok"),
          { ...queueItem("bad-status"), status: "deleted" as never },
          { ...queueItem("bad-image"), image: "https://evil.example/x.jpg" },
        ],
        draft: "javascript:alert(1)",
        local: { "lf-my-photos-v1": "{}", "pflanzenscanner:last-approved-user": "{\"isOwner\":true}" },
      },
      target.store,
    );
    expect(stored).toEqual({ images: 1, queue: 1, draft: 0, local: 1 });
    expect(target.local.has("pflanzenscanner:last-approved-user")).toBe(false);
  });

  it("merges the photo mapping, keeping what the new address already has", () => {
    const merged = JSON.parse(
      mergeMyPhotos(
        JSON.stringify({ photos: { "plant:1": "neu" }, choices: [{ kind: "plant", id: 1 }] }),
        JSON.stringify({
          photos: { "plant:1": "alt", "plant:2": "alt2" },
          choices: [{ kind: "plant", id: 1 }, { kind: "insect", id: 3 }],
        }),
      ),
    );
    expect(merged.photos).toEqual({ "plant:1": "neu", "plant:2": "alt2" });
    expect(merged.choices).toEqual([{ kind: "plant", id: 1 }, { kind: "insect", id: 3 }]);
  });

  it("round-trips through a move file", async () => {
    const source = memoryStore({ images: { a: IMG(5) }, queue: [queueItem("q1")] });
    const blob = await buildMoveFile(source.store);
    const batch = await readMoveFile(await blob.text());
    const target = memoryStore();
    expect(await applyMoveBatch(batch, target.store)).toMatchObject({ images: 1, queue: 1 });
  });

  it("rejects a file that is not a move file", async () => {
    await expect(readMoveFile("not json")).rejects.toThrow(/nicht gelesen/);
    await expect(readMoveFile(JSON.stringify({ format: "other" }))).rejects.toThrow(/keine Umzugsdatei/);
    await expect(readMoveFile(JSON.stringify({ format: MOVE_FILE_FORMAT, version: 2 }))).rejects.toThrow();
  });
});

/** Two windows talking through an in-memory message bus. */
function messageBus() {
  type Handler = (data: unknown, origin: string, source: unknown) => void;
  const windows = new Map<string, { handlers: Set<Handler>; target: { postMessage(m: unknown, o: string): void } }>();
  function windowAt(origin: string) {
    const entry = {
      handlers: new Set<Handler>(),
      target: {
        postMessage(msg: unknown, targetOrigin: string) {
          // Like the browser: delivered only when targetOrigin matches.
          if (targetOrigin !== origin) return;
          queueMicrotask(() => entry.handlers.forEach((h) => h(structuredClone(msg), senderOrigin, null)));
        },
      },
    };
    let senderOrigin = "";
    windows.set(origin, entry);
    return entry;
  }
  const portFor = (origin: string): MessagePort => ({
    post: (target, msg, targetOrigin) => {
      // Record who is sending, then deliver.
      for (const [o, w] of windows) {
        if (w.target === target) {
          if (targetOrigin !== o) return;
          queueMicrotask(() => w.handlers.forEach((h) => h(structuredClone(msg), origin, null)));
        }
      }
    },
    listen: (handler) => {
      windows.get(origin)!.handlers.add(handler);
      return () => windows.get(origin)!.handlers.delete(handler);
    },
  });
  return { windowAt, portFor };
}

describe("window-to-window transfer", () => {
  const OLD = "https://kraeuter-hexe.onrender.com";
  const NEW = "https://littlefarming.de";

  it("moves all data with acknowledgements and reports what was stored", async () => {
    const bus = messageBus();
    const oldWin = bus.windowAt(OLD);
    const newWin = bus.windowAt(NEW);
    const source = memoryStore({
      images: Object.fromEntries(Array.from({ length: 23 }, (_, i) => [`img${i}`, IMG(10 + i)])),
      queue: [queueItem("q1")],
    });
    const target = memoryStore();
    let done = false;

    const sending = sendDeviceData({
      target: newWin.target,
      targetOrigin: NEW,
      store: source.store,
      port: bus.portFor(OLD),
    });
    receiveDeviceData({
      opener: oldWin.target,
      allowedOrigins: [OLD],
      store: target.store,
      port: bus.portFor(NEW),
      onDone: () => (done = true),
    });

    expect(await sending).toEqual({ images: 23, queue: 1, draft: 0, local: 0 });
    expect(target.images.size).toBe(23);
    expect(done).toBe(true);
  });

  it("ignores data from an address that is not on the allowed list", async () => {
    const bus = messageBus();
    const evil = bus.windowAt("https://evil.example");
    const newWin = bus.windowAt(NEW);
    const target = memoryStore();

    const sending = sendDeviceData({
      target: newWin.target,
      targetOrigin: NEW,
      store: memoryStore({ images: { x: IMG(3) } }).store,
      port: bus.portFor("https://evil.example"),
      readyTimeoutMs: 50,
    });
    receiveDeviceData({
      opener: evil.target,
      allowedOrigins: [OLD],
      store: target.store,
      port: bus.portFor(NEW),
    });

    await expect(sending).rejects.toThrow(/nicht gemeldet/);
    expect(target.images.size).toBe(0);
  });
});
