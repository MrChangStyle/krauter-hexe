/**
 * Unit tests for the IndexedDB-backed scan queue (scan-queue.ts).
 *
 * We use `fake-indexeddb` to provide a fully in-memory IndexedDB
 * implementation so the tests run in a plain Node environment without a browser.
 *
 * Each test gets both:
 *  1. A new IDBFactory instance (fresh, empty database).
 *  2. A re-imported scan-queue module (clears the module-level `dbPromise`
 *     singleton so the next openDb() call opens a connection to the new factory).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

type ScanQueueModule = typeof import("@/lib/scan-queue");

async function freshModule(): Promise<ScanQueueModule> {
  // Fresh IDBFactory = fresh, empty database for this test.
  globalThis.indexedDB = new IDBFactory();
  // Fresh module import = the module-level dbPromise singleton is reset.
  vi.resetModules();
  return import("@/lib/scan-queue");
}

// ---------------------------------------------------------------------------
// addPendingScan / getAllPendingScans – basic CRUD
// ---------------------------------------------------------------------------

describe("addPendingScan", () => {
  let m: ScanQueueModule;
  beforeEach(async () => { m = await freshModule(); });

  it("stores a scan with status 'pending' and 0 attempts", async () => {
    const item = await m.addPendingScan("data:image/png;base64,AAA");
    expect(item.status).toBe("pending");
    expect(item.attempts).toBe(0);
    expect(item.image).toBe("data:image/png;base64,AAA");
    expect(item.id).toBeTruthy();
    expect(typeof item.createdAt).toBe("number");
  });

  it("stores the optional side image when provided", async () => {
    const item = await m.addPendingScan("data:top", "data:side");
    expect(item.imageSide).toBe("data:side");
  });

  it("omits imageSide when not provided", async () => {
    const item = await m.addPendingScan("data:top");
    expect(item.imageSide).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAllPendingScans – ordering and crash-recovery coercion
// ---------------------------------------------------------------------------

describe("getAllPendingScans", () => {
  let m: ScanQueueModule;
  beforeEach(async () => { m = await freshModule(); });

  it("returns an empty array when the store is empty", async () => {
    const items = await m.getAllPendingScans();
    expect(items).toEqual([]);
  });

  it("returns items sorted oldest-first (by createdAt)", async () => {
    const first = await m.addPendingScan("data:first");
    // Bump the clock so the second item has a later createdAt.
    await new Promise((r) => setTimeout(r, 5));
    const second = await m.addPendingScan("data:second");

    const items = await m.getAllPendingScans();
    expect(items[0].id).toBe(first.id);
    expect(items[1].id).toBe(second.id);
  });

  it("coerces a persisted 'scanning' status to 'pending' (crash recovery)", async () => {
    // Write an item that was left in "scanning" state (e.g. tab closed mid-scan).
    const item = await m.addPendingScan("data:img");
    await m.putPendingScan({ ...item, status: "scanning" });

    const items = await m.getAllPendingScans();
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("pending");
  });

  it("does not coerce 'error' status", async () => {
    const item = await m.addPendingScan("data:img");
    await m.putPendingScan({
      ...item,
      status: "error",
      error: "boom",
      attempts: 1,
    });

    const items = await m.getAllPendingScans();
    expect(items[0].status).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// getPendingScan
// ---------------------------------------------------------------------------

describe("getPendingScan", () => {
  let m: ScanQueueModule;
  beforeEach(async () => { m = await freshModule(); });

  it("returns the item when it exists", async () => {
    const item = await m.addPendingScan("data:img");
    const fetched = await m.getPendingScan(item.id);
    expect(fetched?.id).toBe(item.id);
  });

  it("returns undefined for a non-existent id", async () => {
    const fetched = await m.getPendingScan("does-not-exist");
    expect(fetched).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// putPendingScan – status transitions
// ---------------------------------------------------------------------------

describe("putPendingScan", () => {
  let m: ScanQueueModule;
  beforeEach(async () => { m = await freshModule(); });

  it("pending → error transition is persisted", async () => {
    const item = await m.addPendingScan("data:img");
    await m.putPendingScan({
      ...item,
      status: "error",
      error: "bad",
      attempts: 1,
    });
    const fetched = await m.getPendingScan(item.id);
    expect(fetched?.status).toBe("error");
    expect(fetched?.error).toBe("bad");
    expect(fetched?.attempts).toBe(1);
  });

  it("error → pending transition is persisted (manual retry path)", async () => {
    const item = await m.addPendingScan("data:img");
    await m.putPendingScan({
      ...item,
      status: "error",
      error: "bad",
      attempts: 1,
    });
    const errored = (await m.getPendingScan(item.id))!;
    // Simulate the retry() call in scan-queue-context.tsx
    await m.putPendingScan({ ...errored, status: "pending", error: undefined });
    const retried = await m.getPendingScan(item.id);
    expect(retried?.status).toBe("pending");
    expect(retried?.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// markScanError – atomic get+put
// ---------------------------------------------------------------------------

describe("markScanError", () => {
  let m: ScanQueueModule;
  beforeEach(async () => { m = await freshModule(); });

  it("marks an existing item as error and increments attempts", async () => {
    const item = await m.addPendingScan("data:img");
    const updated = await m.markScanError(item.id, "server exploded", false);
    expect(updated).toBe(true);

    const fetched = await m.getPendingScan(item.id);
    expect(fetched?.status).toBe("error");
    expect(fetched?.error).toBe("server exploded");
    expect(fetched?.attempts).toBe(1);
    expect(fetched?.autoRetry).toBe(false);
  });

  it("sets autoRetry=true for transient (5xx) failures", async () => {
    const item = await m.addPendingScan("data:img");
    await m.markScanError(item.id, "503", true);
    const fetched = await m.getPendingScan(item.id);
    expect(fetched?.autoRetry).toBe(true);
  });

  it("returns false and does not recreate a previously removed item", async () => {
    const item = await m.addPendingScan("data:img");
    await m.deletePendingScan(item.id);
    const updated = await m.markScanError(item.id, "late error", false);
    expect(updated).toBe(false);
    expect(await m.getPendingScan(item.id)).toBeUndefined();
  });

  it("accumulates attempts across multiple errors", async () => {
    const item = await m.addPendingScan("data:img");
    await m.markScanError(item.id, "err1", true);
    await m.markScanError(item.id, "err2", true);
    const fetched = await m.getPendingScan(item.id);
    expect(fetched?.attempts).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// resetPendingScan – manual retry / watchdog revival
// ---------------------------------------------------------------------------

describe("resetPendingScan", () => {
  let m: ScanQueueModule;
  beforeEach(async () => { m = await freshModule(); });

  it("clears the error state and the attempt counter", async () => {
    const item = await m.addPendingScan("data:img");
    await m.markScanError(item.id, "boom", true);
    await m.markScanError(item.id, "boom", true);

    expect(await m.resetPendingScan(item.id)).toBe(true);

    const fetched = await m.getPendingScan(item.id);
    expect(fetched?.status).toBe("pending");
    expect(fetched?.attempts).toBe(0);
    expect(fetched?.error).toBeUndefined();
    expect(fetched?.autoRetry).toBeUndefined();
    expect(fetched?.lastAttemptAt).toBeUndefined();
  });

  it("keeps the photo itself untouched", async () => {
    const item = await m.addPendingScan("data:top", "data:side");
    await m.markScanError(item.id, "boom", true);
    await m.resetPendingScan(item.id);

    const fetched = await m.getPendingScan(item.id);
    expect(fetched?.image).toBe("data:top");
    expect(fetched?.imageSide).toBe("data:side");
    expect(fetched?.createdAt).toBe(item.createdAt);
  });

  it("resets the revival counter for a manual retry", async () => {
    const item = await m.addPendingScan("data:img");
    await m.resetPendingScan(item.id, { countAsRevival: true });
    expect((await m.getPendingScan(item.id))?.revivals).toBe(1);

    await m.resetPendingScan(item.id);
    expect((await m.getPendingScan(item.id))?.revivals).toBe(0);
  });

  it("counts up revivals so the watchdog eventually gives up", async () => {
    const item = await m.addPendingScan("data:img");
    await m.resetPendingScan(item.id, { countAsRevival: true });
    await m.resetPendingScan(item.id, { countAsRevival: true });
    expect((await m.getPendingScan(item.id))?.revivals).toBe(2);
  });

  it("returns false for an item that no longer exists", async () => {
    const item = await m.addPendingScan("data:img");
    await m.deletePendingScan(item.id);
    expect(await m.resetPendingScan(item.id)).toBe(false);
    expect(await m.getPendingScan(item.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// findRevivableScans – which stuck items the watchdog picks up
// ---------------------------------------------------------------------------

describe("findRevivableScans", () => {
  let m: ScanQueueModule;
  beforeEach(async () => { m = await freshModule(); });

  const NOW = 1_000_000_000_000;

  function stuck(overrides: Partial<import("@/lib/scan-queue").PendingScan> = {}) {
    return {
      id: crypto.randomUUID(),
      image: "data:img",
      createdAt: NOW - 60 * 60 * 1_000,
      status: "error" as const,
      attempts: 5,
      autoRetry: true,
      lastAttemptAt: NOW - 60 * 60 * 1_000,
      ...overrides,
    };
  }

  it("revives a transient failure that has rested long enough", () => {
    const items = [stuck()];
    expect(m.findRevivableScans(items, NOW, 5)).toHaveLength(1);
  });

  it("leaves an item alone while it is still within the back-off window", () => {
    const items = [stuck({ lastAttemptAt: NOW - 1_000 })];
    expect(m.findRevivableScans(items, NOW, 5)).toHaveLength(0);
  });

  it("never revives a permanent (4xx) failure", () => {
    // Waiting cannot fix a photo the server rejects outright, so retrying it
    // unattended would only waste the daily quota.
    const items = [stuck({ autoRetry: false })];
    expect(m.findRevivableScans(items, NOW, 5)).toHaveLength(0);
  });

  it("ignores items that still have automatic attempts left", () => {
    // The normal drain loop handles these; the watchdog must not double up.
    const items = [stuck({ attempts: 2 })];
    expect(m.findRevivableScans(items, NOW, 5)).toHaveLength(0);
  });

  it("ignores items that are merely waiting", () => {
    const items = [stuck({ status: "pending" })];
    expect(m.findRevivableScans(items, NOW, 5)).toHaveLength(0);
  });

  it("gives up after MAX_AUTO_REVIVALS rounds", () => {
    const items = [stuck({ revivals: m.MAX_AUTO_REVIVALS })];
    expect(m.findRevivableScans(items, NOW, 5)).toHaveLength(0);
  });

  it("still revives an item on its last allowed round", () => {
    const items = [stuck({ revivals: m.MAX_AUTO_REVIVALS - 1 })];
    expect(m.findRevivableScans(items, NOW, 5)).toHaveLength(1);
  });

  it("falls back to createdAt for legacy items without lastAttemptAt", () => {
    const items = [stuck({ lastAttemptAt: undefined })];
    expect(m.findRevivableScans(items, NOW, 5)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// deletePendingScan
// ---------------------------------------------------------------------------

describe("deletePendingScan", () => {
  let m: ScanQueueModule;
  beforeEach(async () => { m = await freshModule(); });

  it("removes the item from the store", async () => {
    const item = await m.addPendingScan("data:img");
    await m.deletePendingScan(item.id);
    expect(await m.getPendingScan(item.id)).toBeUndefined();
  });

  it("does not throw when deleting a non-existent id", async () => {
    await expect(m.deletePendingScan("ghost")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Mushroom draft lifecycle
// ---------------------------------------------------------------------------

describe("mushroom draft", () => {
  let m: ScanQueueModule;
  beforeEach(async () => { m = await freshModule(); });

  it("returns undefined when no draft exists", async () => {
    expect(await m.getMushroomDraft()).toBeUndefined();
  });

  it("saves and retrieves Bild 1 (von oben)", async () => {
    await m.putMushroomDraft("data:bild1");
    const draft = await m.getMushroomDraft();
    expect(draft?.image).toBe("data:bild1");
    expect(draft?.id).toBe("draft");
    expect(typeof draft?.createdAt).toBe("number");
  });

  it("replaces an existing draft (at most one draft exists at a time)", async () => {
    await m.putMushroomDraft("data:bild1-v1");
    await m.putMushroomDraft("data:bild1-v2");
    const draft = await m.getMushroomDraft();
    expect(draft?.image).toBe("data:bild1-v2");
  });

  it("promote path: clear draft after both images are queued", async () => {
    await m.putMushroomDraft("data:bild1");
    // Simulate user capturing Bild 2 and enqueueing the full scan.
    await m.addPendingScan("data:bild1", "data:bild2");
    await m.clearMushroomDraft();

    expect(await m.getMushroomDraft()).toBeUndefined();
    // The combined scan entry must still be in the pending queue.
    const scans = await m.getAllPendingScans();
    expect(scans).toHaveLength(1);
    expect(scans[0].imageSide).toBe("data:bild2");
  });

  it("cancel path: clear draft removes it without touching pending scans", async () => {
    await m.putMushroomDraft("data:bild1");
    await m.addPendingScan("data:unrelated");
    await m.clearMushroomDraft();

    expect(await m.getMushroomDraft()).toBeUndefined();
    // Unrelated pending scan must be untouched.
    expect(await m.getAllPendingScans()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// isNetworkError helper
// ---------------------------------------------------------------------------

describe("isNetworkError", () => {
  let m: ScanQueueModule;
  beforeEach(async () => { m = await freshModule(); });

  it("returns true for a plain TypeError (fetch failed / device offline)", () => {
    expect(m.isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("returns false for an ApiError (server responded with an HTTP error)", () => {
    const err = { name: "ApiError", status: 422 };
    expect(m.isNetworkError(err)).toBe(false);
  });

  it("returns false for a ResponseParseError", () => {
    expect(m.isNetworkError({ name: "ResponseParseError" })).toBe(false);
  });

  it("returns true for null", () => {
    expect(m.isNetworkError(null)).toBe(true);
  });

  it("returns true for undefined", () => {
    expect(m.isNetworkError(undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Retry back-off – bounds how fast a failing photo may be attempted again
// ---------------------------------------------------------------------------

describe("retryBackoffMs", () => {
  let m: ScanQueueModule;
  beforeEach(async () => { m = await freshModule(); });

  it("grows with each attempt and then stays at the longest wait", () => {
    const [first, second, third] = m.RETRY_BACKOFF_MS;
    expect(m.retryBackoffMs(1)).toBe(first);
    expect(m.retryBackoffMs(2)).toBe(second);
    expect(m.retryBackoffMs(3)).toBe(third);
    // Beyond the schedule the wait must not fall back to a short one.
    expect(m.retryBackoffMs(99)).toBe(third);
  });

  it("never returns a zero wait, even for a nonsensical attempt count", () => {
    expect(m.retryBackoffMs(0)).toBe(m.RETRY_BACKOFF_MS[0]);
    expect(m.retryBackoffMs(-5)).toBe(m.RETRY_BACKOFF_MS[0]);
  });
});

describe("isRetryDue", () => {
  let m: ScanQueueModule;
  beforeEach(async () => { m = await freshModule(); });

  const item = (nextAttemptAt?: number) =>
    ({ nextAttemptAt }) as unknown as import("@/lib/scan-queue").PendingScan;

  it("treats an item written by an older app version as due immediately", () => {
    expect(m.isRetryDue(item(undefined), 1_000)).toBe(true);
  });

  it("is not due before the back-off has elapsed", () => {
    expect(m.isRetryDue(item(5_000), 4_999)).toBe(false);
  });

  it("is due exactly when the back-off elapses", () => {
    expect(m.isRetryDue(item(5_000), 5_000)).toBe(true);
  });
});

describe("markScanError back-off", () => {
  let m: ScanQueueModule;
  beforeEach(async () => { m = await freshModule(); });

  it("schedules the next attempt into the future on the first failure", async () => {
    const created = await m.addPendingScan("data:image/png;base64,AAA");
    const before = Date.now();
    await m.markScanError(created.id, "Serverfehler", true);
    const stored = await m.getPendingScan(created.id);
    expect(stored?.nextAttemptAt).toBeGreaterThanOrEqual(before + m.RETRY_BACKOFF_MS[0]!);
  });

  it("waits longer after the second failure than after the first", async () => {
    const created = await m.addPendingScan("data:image/png;base64,AAA");
    await m.markScanError(created.id, "Serverfehler", true);
    const first = await m.getPendingScan(created.id);
    await m.markScanError(created.id, "Serverfehler", true);
    const second = await m.getPendingScan(created.id);
    expect(second!.nextAttemptAt! - second!.lastAttemptAt!).toBeGreaterThan(
      first!.nextAttemptAt! - first!.lastAttemptAt!,
    );
  });

  it("also throttles permanent failures, so a manual retry cannot spin", async () => {
    const created = await m.addPendingScan("data:image/png;base64,AAA");
    await m.markScanError(created.id, "Dauerhaft kaputt", false);
    const stored = await m.getPendingScan(created.id);
    expect(stored?.autoRetry).toBe(false);
    expect(stored?.nextAttemptAt).toBeDefined();
  });

  it("clears the back-off when the item is reset", async () => {
    const created = await m.addPendingScan("data:image/png;base64,AAA");
    await m.markScanError(created.id, "Serverfehler", true);
    await m.resetPendingScan(created.id);
    const stored = await m.getPendingScan(created.id);
    expect(stored?.nextAttemptAt).toBeUndefined();
  });
});
