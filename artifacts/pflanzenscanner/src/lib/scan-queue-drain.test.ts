/**
 * Unit tests for the core drain-loop in scan-queue-drain.ts.
 *
 * drainQueue accepts all side-effects via DrainDeps, so every test runs in a
 * plain Node environment with no browser or React setup required.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { drainQueue, type DrainDeps } from "@/lib/scan-queue-drain";
import type { PendingScan } from "@/lib/scan-queue";
import type { Plant } from "@workspace/api-client-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePending(overrides: Partial<PendingScan> = {}): PendingScan {
  return {
    id: overrides.id ?? "item-" + Math.random().toString(36).slice(2),
    image: "data:image/png;base64,AAA",
    createdAt: Date.now(),
    status: "pending",
    attempts: 0,
    ...overrides,
  };
}

const fakePlant = { id: "p1", name: "Brennnessel" } as unknown as Plant;

/**
 * Build a DrainDeps object with safe defaults.
 * `getAllPendingScans` defaults to: one pending item on the first call,
 * empty list on all subsequent calls (so the loop exits after one item).
 */
function makeDeps(overrides: Partial<DrainDeps> = {}): DrainDeps {
  const defaultItem = makePending();
  const getAllPendingScans = vi
    .fn()
    .mockResolvedValueOnce([defaultItem])  // loop iteration 1 — finds item
    .mockResolvedValue([]);                // loop iteration 2 (exit) + tail drain

  return {
    lockRef: { current: false },
    getIsOnline: vi.fn().mockReturnValue(true),
    getAllPendingScans,
    scanPlant: vi.fn().mockResolvedValue({ plant: fakePlant, alreadyInArchive: false }),
    deletePendingScan: vi.fn().mockResolvedValue(undefined),
    markScanError: vi.fn().mockResolvedValue(true),
    isNetworkError: vi.fn().mockReturnValue(false),
    getScanningIds: vi.fn().mockReturnValue(new Set<string>()),
    setScanning: vi.fn(),
    maxAutoAttempts: 3,
    onSuccess: vi.fn(),
    onNotPlant: vi.fn(),
    onAuthError: vi.fn(),
    scheduleFollowUpDrain: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Lock and offline guards
// ---------------------------------------------------------------------------

describe("lock guard", () => {
  it("returns immediately (zero stats) when lockRef.current is already true", async () => {
    const deps = makeDeps();
    deps.lockRef.current = true;

    const stats = await drainQueue(deps);

    expect(stats).toEqual({ added: 0, duplicates: 0, failed: 0, notPlant: 0, networkStop: false });
    expect(deps.getAllPendingScans).not.toHaveBeenCalled();
  });

  it("claims the lock before the first await and releases it in the finally block", async () => {
    const deps = makeDeps();
    expect(deps.lockRef.current).toBe(false);

    const promise = drainQueue(deps);
    // Lock must be claimed synchronously (before any await resolves).
    expect(deps.lockRef.current).toBe(true);

    await promise;
    // Lock must be released in the finally block.
    expect(deps.lockRef.current).toBe(false);
  });

  it("releases the lock even when getAllPendingScans throws", async () => {
    const deps = makeDeps({
      getAllPendingScans: vi.fn().mockRejectedValue(new Error("IDB exploded")),
    });

    await expect(drainQueue(deps)).rejects.toThrow("IDB exploded");
    expect(deps.lockRef.current).toBe(false);
  });
});

describe("offline guard", () => {
  it("returns immediately (zero stats) when device is offline at call time", async () => {
    const deps = makeDeps({ getIsOnline: vi.fn().mockReturnValue(false) });

    const stats = await drainQueue(deps);

    expect(stats).toEqual({ added: 0, duplicates: 0, failed: 0, notPlant: 0, networkStop: false });
    expect(deps.getAllPendingScans).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("happy path", () => {
  it("scans the item, calls onSuccess, deletes the item, and returns added:1", async () => {
    const item = makePending();
    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValue([]),
    });

    const stats = await drainQueue(deps);

    expect(deps.scanPlant).toHaveBeenCalledWith({ image: item.image });
    expect(deps.deletePendingScan).toHaveBeenCalledWith(item.id);
    expect(deps.onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: item.id, plant: fakePlant, alreadyInArchive: false }),
    );
    expect(stats).toMatchObject({ added: 1, duplicates: 0, failed: 0, networkStop: false });
  });

  it("passes imageSide when the item has a side photo (two-photo mushroom scan)", async () => {
    const item = makePending({ imageSide: "data:side" });
    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValue([]),
    });

    await drainQueue(deps);

    expect(deps.scanPlant).toHaveBeenCalledWith({
      image: item.image,
      imageSide: "data:side",
    });
  });

  it("counts a duplicate (alreadyInArchive) in duplicates, not added", async () => {
    const item = makePending();
    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValue([]),
      scanPlant: vi.fn().mockResolvedValue({ plant: fakePlant, alreadyInArchive: true }),
    });

    const stats = await drainQueue(deps);

    expect(stats).toMatchObject({ added: 0, duplicates: 1, failed: 0 });
    expect(deps.onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ alreadyInArchive: true }),
    );
  });

  it("marks setScanning(id, true) before scan and setScanning(id, false) after", async () => {
    const item = makePending();
    const calls: Array<[string, boolean]> = [];
    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValue([]),
      setScanning: vi.fn((id, on) => calls.push([id, on])),
    });

    await drainQueue(deps);

    expect(calls).toEqual([[item.id, true], [item.id, false]]);
  });

  it("processes multiple items in sequence (oldest first, as returned by getAllPendingScans)", async () => {
    const a = makePending({ id: "a", image: "data:image/png;a" });
    const b = makePending({ id: "b", image: "data:image/png;b" });
    const processedIds: string[] = [];

    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([a, b])
        .mockResolvedValueOnce([b])
        .mockResolvedValue([]),
      scanPlant: vi.fn().mockImplementation(async (args: { image: string }) => {
        // Track which item id corresponds to each image call
        processedIds.push(args.image === a.image ? "a" : "b");
        return { plant: fakePlant, alreadyInArchive: false };
      }),
    });

    const stats = await drainQueue(deps);
    expect(stats.added).toBe(2);
    expect(processedIds).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// Network error mid-drain
// ---------------------------------------------------------------------------

describe("network error", () => {
  it("stops the loop and sets networkStop:true when scanPlant throws a network error", async () => {
    const item = makePending();
    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValue([]),
      scanPlant: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
      isNetworkError: vi.fn().mockReturnValue(true),
    });

    const stats = await drainQueue(deps);

    expect(stats.networkStop).toBe(true);
    expect(stats.failed).toBe(0);
    expect(deps.markScanError).not.toHaveBeenCalled();
    // Item must NOT have been deleted — it stays pending for the next drain.
    expect(deps.deletePendingScan).not.toHaveBeenCalled();
  });

  it("stops the loop when getIsOnline turns false between iterations", async () => {
    const a = makePending({ id: "a" });
    const b = makePending({ id: "b" });
    let callCount = 0;
    const deps = makeDeps({
      // First call returns both items; after processing 'a', go offline.
      getAllPendingScans: vi.fn().mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) return [a, b];
        return [b]; // 'b' still pending but we're now offline
      }),
      // false on the SECOND online-check (after the first getAllPendingScans has run)
    getIsOnline: vi.fn().mockImplementation(() => callCount < 1),
    });

    const stats = await drainQueue(deps);

    expect(stats.networkStop).toBe(true);
    // Only 'a' was processed before going offline.
    expect(deps.scanPlant).toHaveBeenCalledTimes(1);
  });

  it("does NOT call scheduleFollowUpDrain when a network stop occurred", async () => {
    const item = makePending();
    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValue([item]), // still pending after the stop
      scanPlant: vi.fn().mockRejectedValue(new TypeError("offline")),
      isNetworkError: vi.fn().mockReturnValue(true),
    });

    await drainQueue(deps);

    expect(deps.scheduleFollowUpDrain).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Auth errors (401 / 403)
// ---------------------------------------------------------------------------

describe("auth errors", () => {
  for (const status of [401, 403]) {
    it(`stops the loop and calls onAuthError on ${status}`, async () => {
      const item = makePending();
      const err = Object.assign(new Error("Unauthorized"), { status, name: "ApiError" });
      const deps = makeDeps({
        getAllPendingScans: vi.fn()
          .mockResolvedValueOnce([item])
          .mockResolvedValue([]),
        scanPlant: vi.fn().mockRejectedValue(err),
        isNetworkError: vi.fn().mockReturnValue(false),
      });

      const stats = await drainQueue(deps);

      expect(stats.networkStop).toBe(true);
      expect(deps.onAuthError).toHaveBeenCalledTimes(1);
      expect(deps.markScanError).not.toHaveBeenCalled();
      expect(deps.deletePendingScan).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------
// Transient (5xx) vs permanent (4xx) failures
// ---------------------------------------------------------------------------

describe("5xx transient failure", () => {
  it("calls markScanError with autoRetry=true", async () => {
    const item = makePending();
    const err = Object.assign(new Error("Service Unavailable"), {
      status: 503,
      name: "ApiError",
      data: { error: "AI ist überlastet" },
    });
    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValue([]),
      scanPlant: vi.fn().mockRejectedValue(err),
      isNetworkError: vi.fn().mockReturnValue(false),
    });

    const stats = await drainQueue(deps);

    expect(deps.markScanError).toHaveBeenCalledWith(item.id, "AI ist überlastet", true);
    expect(stats.failed).toBe(1);
  });

  it("falls back to the generic German error message when data.error is absent", async () => {
    const item = makePending();
    const err = Object.assign(new Error("Internal Server Error"), {
      status: 500,
      name: "ApiError",
    });
    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValue([]),
      scanPlant: vi.fn().mockRejectedValue(err),
      isNetworkError: vi.fn().mockReturnValue(false),
    });

    await drainQueue(deps);

    expect(deps.markScanError).toHaveBeenCalledWith(
      item.id,
      "Der Scan ist fehlgeschlagen. Bitte versuche es erneut.",
      true,
    );
  });
});

describe("4xx permanent failure", () => {
  it("calls markScanError with autoRetry=false", async () => {
    const item = makePending();
    const err = Object.assign(new Error("Bad Request"), {
      status: 422,
      name: "ApiError",
      data: { error: "Ungültiges Bild" },
    });
    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValue([]),
      scanPlant: vi.fn().mockRejectedValue(err),
      isNetworkError: vi.fn().mockReturnValue(false),
    });

    const stats = await drainQueue(deps);

    expect(deps.markScanError).toHaveBeenCalledWith(item.id, "Ungültiges Bild", false);
    expect(stats.failed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Auto-retry gate (maxAutoAttempts)
// ---------------------------------------------------------------------------

describe("maxAutoAttempts gate", () => {
  it("picks up an error item whose attempts < maxAutoAttempts (autoRetry=true)", async () => {
    const item = makePending({ status: "error", autoRetry: true, attempts: 2 });
    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValue([]),
      maxAutoAttempts: 3,
    });

    await drainQueue(deps);

    expect(deps.scanPlant).toHaveBeenCalled();
  });

  it("skips an error item whose attempts === maxAutoAttempts (needs manual retry)", async () => {
    const item = makePending({ status: "error", autoRetry: true, attempts: 3 });
    const deps = makeDeps({
      getAllPendingScans: vi.fn().mockResolvedValue([item]),
      maxAutoAttempts: 3,
    });

    await drainQueue(deps);

    expect(deps.scanPlant).not.toHaveBeenCalled();
  });

  it("skips an error item with autoRetry=false regardless of attempts", async () => {
    const item = makePending({ status: "error", autoRetry: false, attempts: 0 });
    const deps = makeDeps({
      getAllPendingScans: vi.fn().mockResolvedValue([item]),
    });

    await drainQueue(deps);

    expect(deps.scanPlant).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// In-flight dedup (getScanningIds)
// ---------------------------------------------------------------------------

describe("in-flight dedup via getScanningIds", () => {
  it("skips an item whose id is already in the scanning set", async () => {
    const item = makePending({ id: "inflight" });
    const deps = makeDeps({
      getAllPendingScans: vi.fn().mockResolvedValue([item]),
      getScanningIds: vi.fn().mockReturnValue(new Set(["inflight"])),
    });

    await drainQueue(deps);

    expect(deps.scanPlant).not.toHaveBeenCalled();
  });

  it("processes an item whose id is NOT in the scanning set", async () => {
    const item = makePending({ id: "fresh" });
    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValue([]),
      getScanningIds: vi.fn().mockReturnValue(new Set(["some-other-id"])),
    });

    await drainQueue(deps);

    expect(deps.scanPlant).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Per-drain dedup (attemptedThisDrain)
// ---------------------------------------------------------------------------

describe("per-drain dedup (attemptedThisDrain)", () => {
  it("does not retry the same item twice within one drain even if getAllPendingScans returns it again", async () => {
    const item = makePending({ id: "retry-candidate" });
    // Simulate: item fails with transient error; DB now shows it as error+autoRetry.
    // getAllPendingScans keeps returning it (e.g. markScanError hasn't been awaited yet).
    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValueOnce([{ ...item, status: "error" as const, autoRetry: true, attempts: 1 }])
        .mockResolvedValue([]),
      scanPlant: vi.fn().mockRejectedValue(
        Object.assign(new Error("503"), { status: 503, name: "ApiError" }),
      ),
      isNetworkError: vi.fn().mockReturnValue(false),
    });

    await drainQueue(deps);

    // Must scan exactly once — the per-drain set prevents a second attempt.
    expect(deps.scanPlant).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Tail-drain / scheduleFollowUpDrain
// ---------------------------------------------------------------------------

describe("scheduleFollowUpDrain", () => {
  it("is called when a pending item appears after the loop exits (item enqueued mid-drain)", async () => {
    // Loop sees nothing to process (empty first result), then a new item appears in the tail-drain check.
    const lateItem = makePending();
    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([])   // loop: nothing to drain
        .mockResolvedValueOnce([lateItem]), // tail-drain check: new item arrived
    });

    await drainQueue(deps);

    expect(deps.scheduleFollowUpDrain).toHaveBeenCalledTimes(1);
  });

  it("is NOT called when the tail-drain check finds nothing pending", async () => {
    const item = makePending();
    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValue([]), // loop exit + tail-drain: empty
    });

    await drainQueue(deps);

    expect(deps.scheduleFollowUpDrain).not.toHaveBeenCalled();
  });

  it("is NOT called after a network stop even if pending items remain", async () => {
    const item = makePending();
    const deps = makeDeps({
      getAllPendingScans: vi.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValue([item]),
      scanPlant: vi.fn().mockRejectedValue(new TypeError("offline")),
      isNetworkError: vi.fn().mockReturnValue(true),
    });

    await drainQueue(deps);

    expect(deps.scheduleFollowUpDrain).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Retry back-off – a failed item must not be re-attempted by the next drain
// ---------------------------------------------------------------------------

describe("retry back-off gate", () => {
  it("skips an error item whose back-off has not elapsed yet", async () => {
    const item = makePending({
      status: "error",
      autoRetry: true,
      attempts: 1,
      nextAttemptAt: 5_000,
    });
    const deps = makeDeps({
      getAllPendingScans: vi.fn().mockResolvedValue([item]),
      maxAutoAttempts: 3,
      now: () => 4_999,
    });

    const stats = await drainQueue(deps);

    expect(deps.scanPlant).not.toHaveBeenCalled();
    expect(stats.added).toBe(0);
    expect(stats.failed).toBe(0);
  });

  it("attempts the item once the back-off has elapsed", async () => {
    const item = makePending({
      status: "error",
      autoRetry: true,
      attempts: 1,
      nextAttemptAt: 5_000,
    });
    const deps = makeDeps({
      getAllPendingScans: vi.fn().mockResolvedValueOnce([item]).mockResolvedValue([]),
      maxAutoAttempts: 3,
      now: () => 5_000,
    });

    await drainQueue(deps);

    expect(deps.scanPlant).toHaveBeenCalledTimes(1);
  });

  it("attempts an item from an older app version that has no back-off stored", async () => {
    const item = makePending({ status: "error", autoRetry: true, attempts: 1 });
    const deps = makeDeps({
      getAllPendingScans: vi.fn().mockResolvedValueOnce([item]).mockResolvedValue([]),
      maxAutoAttempts: 3,
      now: () => 5_000,
    });

    await drainQueue(deps);

    expect(deps.scanPlant).toHaveBeenCalledTimes(1);
  });

  it("does not gate a freshly captured pending photo", async () => {
    // nextAttemptAt only ever applies to items that already failed; a new photo
    // must still be scanned immediately.
    const item = makePending({ status: "pending", nextAttemptAt: 999_999 });
    const deps = makeDeps({
      getAllPendingScans: vi.fn().mockResolvedValueOnce([item]).mockResolvedValue([]),
      now: () => 0,
    });

    await drainQueue(deps);

    expect(deps.scanPlant).toHaveBeenCalledTimes(1);
  });
});
