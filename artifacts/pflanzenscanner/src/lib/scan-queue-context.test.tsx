// @vitest-environment jsdom
/**
 * Unit tests for the React context layer in scan-queue-context.tsx.
 *
 * All side-effects are mocked:
 *   - scan-queue  → vi.fn() stubs (IDB layer is covered by scan-queue.test.ts)
 *   - drainQueue  → controllable mock (lets tests inspect & drive callbacks)
 *   - useToast    → captures toast calls
 *   - scanPlant   → not exercised directly (goes through drainQueue mock)
 *
 * Browser APIs used by the context (navigator.onLine, window events,
 * window.setInterval) are provided by jsdom.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks (must be declared before the first import of the modules under test)
// ---------------------------------------------------------------------------

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// We capture the DrainDeps object passed by the context so individual tests
// can invoke callbacks (onSuccess, onAuthError, scheduleFollowUpDrain).
type DrainDepsCapture = Parameters<typeof import("@/lib/scan-queue-drain").drainQueue>[0];
let capturedDeps: DrainDepsCapture | null = null;

const drainQueueMock = vi.fn().mockImplementation(async (deps: DrainDepsCapture) => {
  capturedDeps = deps;
  return { added: 0, duplicates: 0, failed: 0, networkStop: false };
});

vi.mock("@/lib/scan-queue-drain", () => ({
  drainQueue: (...args: Parameters<typeof drainQueueMock>) => drainQueueMock(...args),
}));

vi.mock("@workspace/api-client-react", () => ({
  scanPlant: vi.fn(),
}));

// Stubs for the scan-queue IDB functions.
const mockAddPendingScan = vi.fn();
const mockDeletePendingScan = vi.fn();
const mockGetAllPendingScans = vi.fn();
const mockGetPendingScan = vi.fn();
const mockMarkScanError = vi.fn();
const mockPutPendingScan = vi.fn();
const mockIsNetworkError = vi.fn().mockReturnValue(false);
const mockResetPendingScan = vi.fn().mockResolvedValue(true);
// Defaults to "nothing to revive" so the watchdog stays inert unless a test
// explicitly opts in.
const mockFindRevivableScans = vi.fn().mockReturnValue([]);

vi.mock("@/lib/scan-queue", () => ({
  addPendingScan: (...a: unknown[]) => mockAddPendingScan(...a),
  deletePendingScan: (...a: unknown[]) => mockDeletePendingScan(...a),
  getAllPendingScans: (...a: unknown[]) => mockGetAllPendingScans(...a),
  getPendingScan: (...a: unknown[]) => mockGetPendingScan(...a),
  markScanError: (...a: unknown[]) => mockMarkScanError(...a),
  putPendingScan: (...a: unknown[]) => mockPutPendingScan(...a),
  resetPendingScan: (...a: unknown[]) => mockResetPendingScan(...a),
  findRevivableScans: (...a: unknown[]) => mockFindRevivableScans(...a),
  isNetworkError: (...a: unknown[]) => mockIsNetworkError(...a),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Import the context *after* mocks are registered.
import { ScanQueueProvider, useScanQueue } from "@/lib/scan-queue-context";
import type { PendingScan } from "@/lib/scan-queue";

function makePending(overrides: Partial<PendingScan> = {}): PendingScan {
  return {
    id: crypto.randomUUID(),
    image: "data:image/png;base64,AAA",
    createdAt: Date.now(),
    status: "pending",
    attempts: 0,
    ...overrides,
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ScanQueueProvider>{children}</ScanQueueProvider>
      </QueryClientProvider>
    );
  }
  return Wrapper;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  capturedDeps = null;

  // Default: empty queue, device online.
  mockGetAllPendingScans.mockResolvedValue([]);
  mockAddPendingScan.mockImplementation(async (image: string, imageSide?: string) =>
    makePending({ image, ...(imageSide ? { imageSide } : {}) }),
  );
  mockDeletePendingScan.mockResolvedValue(undefined);
  mockPutPendingScan.mockResolvedValue(undefined);
  mockGetPendingScan.mockResolvedValue(undefined);

  Object.defineProperty(navigator, "onLine", {
    value: true,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Mount behaviour
// ---------------------------------------------------------------------------

describe("mount", () => {
  it("calls getAllPendingScans on mount and populates pending", async () => {
    const item = makePending();
    mockGetAllPendingScans.mockResolvedValue([item]);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.pending).toHaveLength(1);
    });
    expect(result.current.pending[0].id).toBe(item.id);
  });

  it("drains the queue on mount when there are pending items and device is online", async () => {
    const item = makePending();
    mockGetAllPendingScans.mockResolvedValue([item]);

    renderHook(() => useScanQueue(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(drainQueueMock).toHaveBeenCalled();
    });
  });

  it("does NOT drain on mount when there are no pending items", async () => {
    mockGetAllPendingScans.mockResolvedValue([]);

    renderHook(() => useScanQueue(), { wrapper: makeWrapper() });

    // Give the effect time to settle.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(drainQueueMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// enqueue
// ---------------------------------------------------------------------------

describe("enqueue", () => {
  it("calls addPendingScan with the image and refreshes pending", async () => {
    const newItem = makePending({ image: "data:new" });
    mockAddPendingScan.mockResolvedValue(newItem);
    mockGetAllPendingScans.mockResolvedValue([newItem]);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    let returnedId: string | undefined;
    await act(async () => {
      returnedId = await result.current.enqueue("data:new");
    });

    expect(mockAddPendingScan).toHaveBeenCalledWith("data:new", undefined, undefined, undefined);
    expect(returnedId).toBe(newItem.id);
  });

  it("passes imageSide when provided", async () => {
    const newItem = makePending({ image: "data:top", imageSide: "data:side" });
    mockAddPendingScan.mockResolvedValue(newItem);
    mockGetAllPendingScans.mockResolvedValue([newItem]);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.enqueue("data:top", "data:side");
    });

    expect(mockAddPendingScan).toHaveBeenCalledWith("data:top", "data:side", undefined, undefined);
  });

  it("does NOT drain by itself - the scan page drives that", async () => {
    // enqueue deliberately stops after persisting the photo. The scan page calls
    // processQueue() only AFTER it has set waitingForItemId, otherwise a very
    // fast server response could arrive before the page is listening for it.
    const newItem = makePending();
    mockAddPendingScan.mockResolvedValue(newItem);
    mockGetAllPendingScans.mockResolvedValue([]);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    drainQueueMock.mockClear();

    await act(async () => {
      await result.current.enqueue("data:img");
    });

    expect(drainQueueMock).not.toHaveBeenCalled();

    // ...but an explicit processQueue() call does drain.
    await act(async () => {
      result.current.processQueue();
    });

    await waitFor(() => {
      expect(drainQueueMock).toHaveBeenCalled();
    });
  });

  it("does NOT trigger drainQueue when device is offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const newItem = makePending();
    mockAddPendingScan.mockResolvedValue(newItem);
    mockGetAllPendingScans.mockResolvedValue([newItem]);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    drainQueueMock.mockClear();

    await act(async () => {
      await result.current.enqueue("data:img");
    });

    // processQueue exits early when offline — drainQueue must not have been called.
    expect(drainQueueMock).not.toHaveBeenCalled();
  });

  it("item remains pending and drainQueue is NOT called when device goes offline after addPendingScan resolves", async () => {
    // Device starts online so the mount effect does not suppress anything.
    const newItem = makePending({ image: "data:offline-mid-upload" });

    // Simulate the device dropping offline between the persist step and the
    // drain step: addPendingScan resolves successfully (photo is in IDB), but
    // by the time enqueue() checks getIsOnline() to decide whether to drain,
    // the device is already offline.
    mockAddPendingScan.mockImplementation(async (image: string, imageSide?: string) => {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      return { ...newItem, image, ...(imageSide ? { imageSide } : {}) };
    });
    // After the persist the queue contains the new item — it must not be lost.
    mockGetAllPendingScans.mockResolvedValue([newItem]);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    drainQueueMock.mockClear();

    await act(async () => {
      await result.current.enqueue("data:offline-mid-upload");
    });

    // The photo must still be in the queue with status "pending" — not lost.
    await waitFor(() => {
      expect(result.current.pending).toHaveLength(1);
    });
    expect(result.current.pending[0].status).toBe("pending");

    // processQueue must have exited early due to being offline — drainQueue
    // must not have been called, confirming no silent loss occurred.
    expect(drainQueueMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe("remove", () => {
  it("calls deletePendingScan with the item id", async () => {
    const item = makePending();
    mockGetAllPendingScans.mockResolvedValue([item]);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.pending).toHaveLength(1));

    mockGetAllPendingScans.mockResolvedValue([]);
    await act(async () => {
      await result.current.remove(item.id);
    });

    expect(mockDeletePendingScan).toHaveBeenCalledWith(item.id);
  });

  it("refreshes pending state after deletion", async () => {
    const item = makePending();
    // Use a stateful mock so that every call to getAllPendingScans reflects
    // the current in-memory list — even when the mount effect's processQueue
    // finally-block calls refresh() before we reach the remove() call.
    let currentItems: PendingScan[] = [item];
    mockGetAllPendingScans.mockImplementation(() => Promise.resolve([...currentItems]));
    mockDeletePendingScan.mockImplementation(async (id: string) => {
      currentItems = currentItems.filter((i) => i.id !== id);
    });

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.pending).toHaveLength(1));

    await act(async () => {
      await result.current.remove(item.id);
    });

    await waitFor(() => expect(result.current.pending).toHaveLength(0));
  });
});

// ---------------------------------------------------------------------------
// retry
// ---------------------------------------------------------------------------

describe("retry", () => {
  it("returns early when item does not exist", async () => {
    mockGetAllPendingScans.mockResolvedValue([]);
    // resetPendingScan resolves false when the row is already gone.
    mockResetPendingScan.mockResolvedValue(false);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    drainQueueMock.mockClear();

    await act(async () => {
      await result.current.retry("ghost-id");
    });

    expect(drainQueueMock).not.toHaveBeenCalled();
  });

  it("resets an errored item to a clean pending state", async () => {
    const errorItem = makePending({
      status: "error",
      error: "some error",
      attempts: 2,
      autoRetry: false,
    });
    mockGetAllPendingScans.mockResolvedValue([errorItem]);
    mockResetPendingScan.mockResolvedValue(true);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.retry(errorItem.id);
    });

    expect(mockResetPendingScan).toHaveBeenCalledWith(errorItem.id);
  });

  it("also restarts an item that is still merely waiting", async () => {
    // The queue can be silently gated (expired session, exhausted daily quota),
    // so a "pending" item must be restartable by hand too - not just an errored one.
    const waitingItem = makePending({ status: "pending", attempts: 0 });
    mockGetAllPendingScans.mockResolvedValue([waitingItem]);
    mockResetPendingScan.mockResolvedValue(true);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    drainQueueMock.mockClear();

    await act(async () => {
      await result.current.retry(waitingItem.id);
    });

    expect(mockResetPendingScan).toHaveBeenCalledWith(waitingItem.id);
    await waitFor(() => {
      expect(drainQueueMock).toHaveBeenCalled();
    });
  });

  it("triggers drainQueue after resetting status when online", async () => {
    const errorItem = makePending({ status: "error", attempts: 1 });
    mockGetAllPendingScans.mockResolvedValue([errorItem]);
    mockResetPendingScan.mockResolvedValue(true);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    drainQueueMock.mockClear();

    await act(async () => {
      await result.current.retry(errorItem.id);
    });

    await waitFor(() => {
      expect(drainQueueMock).toHaveBeenCalled();
    });
  });

  it("does NOT trigger drainQueue when device is offline", async () => {
    // Arrange: device is offline from the start so mount does not drain either.
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const errorItem = makePending({ status: "error", error: "network error", attempts: 1 });
    mockGetAllPendingScans.mockResolvedValue([errorItem]);
    mockResetPendingScan.mockResolvedValue(true);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    // Clear any drain calls that may have happened during mount.
    drainQueueMock.mockClear();

    await act(async () => {
      await result.current.retry(errorItem.id);
    });

    // retry() resets the item status but must NOT start a drain while offline.
    expect(mockResetPendingScan).toHaveBeenCalledWith(errorItem.id);
    expect(drainQueueMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// refresh
// ---------------------------------------------------------------------------

describe("refresh", () => {
  it("re-reads the queue and returns the fresh list", async () => {
    const items = [makePending(), makePending()];
    mockGetAllPendingScans.mockResolvedValue(items);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    let returned: PendingScan[] | undefined;
    await act(async () => {
      returned = await result.current.refresh();
    });

    expect(returned).toHaveLength(2);
    expect(result.current.pending).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Auto-retry interval
// ---------------------------------------------------------------------------

describe("auto-retry interval", () => {
  it("calls processQueue every 30 s via the interval when online", async () => {
    vi.useFakeTimers();
    mockGetAllPendingScans.mockResolvedValue([]);

    renderHook(() => useScanQueue(), { wrapper: makeWrapper() });

    // Let the mount effect settle.
    await act(async () => {
      await Promise.resolve();
    });

    drainQueueMock.mockClear();

    // Advance past the 30-second interval.
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(drainQueueMock).toHaveBeenCalled();
  });

  it("does NOT call drainQueue when offline at interval tick", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    mockGetAllPendingScans.mockResolvedValue([]);

    renderHook(() => useScanQueue(), { wrapper: makeWrapper() });

    await act(async () => { await Promise.resolve(); });
    drainQueueMock.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(drainQueueMock).not.toHaveBeenCalled();
  });

  it("drains a stranded photo when the interval fires and the device is back online", async () => {
    vi.useFakeTimers();

    // Device starts offline so neither the mount effect nor any enqueue call
    // triggers a drain — the photo is left stranded in the queue.
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const item = makePending();
    // getAllPendingScans returns the stranded photo on every call so that both
    // the mount refresh and the post-drain refresh see it in the list.
    mockGetAllPendingScans.mockResolvedValue([item]);

    // Make the drain hang so we can assert that the item is still in the
    // pending list while the drain is in-flight (before it resolves/removes it).
    let resolveDrain!: () => void;
    const drainHung = new Promise<{
      added: number;
      duplicates: number;
      failed: number;
      networkStop: boolean;
    }>((resolve) => {
      resolveDrain = () =>
        resolve({ added: 0, duplicates: 0, failed: 0, networkStop: false });
    });
    drainQueueMock.mockImplementation(async (deps: DrainDepsCapture) => {
      capturedDeps = deps;
      return drainHung;
    });

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    // Flush the mount effect (refresh → setPending). Avoid waitFor here because
    // its internal setTimeout polling is frozen by fake timers.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The stranded photo must be visible in the pending list before the interval.
    expect(result.current.pending).toHaveLength(1);

    drainQueueMock.mockClear();

    // Device comes back online before the interval tick.
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

    // Advance past the 30-second interval — the handler calls processQueue.
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    // The interval triggered a drain for the stranded photo.
    expect(drainQueueMock).toHaveBeenCalled();

    // The item is still in pending because the drain promise has not resolved yet.
    expect(result.current.pending).toHaveLength(1);
    expect(result.current.pending[0].id).toBe(item.id);

    // Resolve the hanging drain so effects clean up before the next test.
    resolveDrain();
  });

  it("does not call drainQueue after the component unmounts (interval is cleared on cleanup)", async () => {
    vi.useFakeTimers();
    mockGetAllPendingScans.mockResolvedValue([]);

    const { unmount } = renderHook(() => useScanQueue(), { wrapper: makeWrapper() });

    // Let the mount effect settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Unmount the hook — this triggers the useEffect cleanup which should call
    // clearInterval so the 5-second polling interval stops firing.
    unmount();

    drainQueueMock.mockClear();

    // Advance well past one (and several) interval periods — if clearInterval
    // were not called, processQueue would fire and drainQueueMock would be hit.
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(drainQueueMock).not.toHaveBeenCalled();
  });

  it("does not start a second drain while the first is still running (lock blocks the interval)", async () => {
    vi.useFakeTimers();
    // Empty queue so the mount effect does not trigger its own drain.
    mockGetAllPendingScans.mockResolvedValue([]);

    renderHook(() => useScanQueue(), { wrapper: makeWrapper() });

    // Let the mount effect settle (no drain because queue is empty).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Replace the drain mock with one that acquires the lock and then hangs,
    // simulating a real drainQueue call that has not yet finished.
    let resolveDrain!: () => void;
    const drainHung = new Promise<{
      added: number;
      duplicates: number;
      failed: number;
      networkStop: boolean;
    }>((resolve) => {
      resolveDrain = () =>
        resolve({ added: 0, duplicates: 0, failed: 0, networkStop: false });
    });
    drainQueueMock.mockImplementation(async (deps: DrainDepsCapture) => {
      capturedDeps = deps;
      // Simulate the real drainQueue behaviour: set the lock so any concurrent
      // processQueue call sees it as busy and bails out immediately.
      deps.lockRef.current = true;
      return drainHung;
    });
    drainQueueMock.mockClear();

    // Advance 60 s — covers at least two interval ticks. The first tick starts
    // a hanging drain; every subsequent tick must be blocked by the lock.
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Only the very first tick should have called drainQueueMock; the lock
    // must have prevented every later tick from starting a new drain.
    expect(drainQueueMock).toHaveBeenCalledTimes(1);

    // Unblock the hanging drain so the hook can clean up before the next test.
    resolveDrain();
  });
});

// ---------------------------------------------------------------------------
// Online / offline events
// ---------------------------------------------------------------------------

describe("online / offline events", () => {
  it("triggers processQueue when the browser fires the 'online' event", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    mockGetAllPendingScans.mockResolvedValue([]);

    renderHook(() => useScanQueue(), { wrapper: makeWrapper() });

    await act(async () => { await Promise.resolve(); });
    drainQueueMock.mockClear();

    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(drainQueueMock).toHaveBeenCalled();
    });
  });

  it("retries a queued photo automatically when the device comes back online", async () => {
    // Start offline so the mount effect does not trigger a drain.
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const item = makePending({ image: "data:offline-reconnect-photo" });
    mockAddPendingScan.mockImplementation(async (image: string, imageSide?: string) =>
      ({ ...item, image, ...(imageSide ? { imageSide } : {}) }),
    );
    mockGetAllPendingScans.mockResolvedValue([item]);

    const { result } = renderHook(() => useScanQueue(), { wrapper: makeWrapper() });

    // Let mount effect settle (offline → no drain).
    await act(async () => { await Promise.resolve(); });
    drainQueueMock.mockClear();

    // Enqueue while offline — photo is persisted but drain must not start.
    await act(async () => {
      await result.current.enqueue("data:offline-reconnect-photo");
    });

    await waitFor(() => expect(result.current.pending).toHaveLength(1));
    expect(result.current.pending[0].status).toBe("pending");
    expect(drainQueueMock).not.toHaveBeenCalled();

    // Use a deferred drain so we can assert the item stays "pending" while
    // the drain is in-flight (not removed prematurely).
    let resolveDrain!: () => void;
    const drainPromise = new Promise<void>((res) => { resolveDrain = res; });
    drainQueueMock.mockImplementation(async () => {
      await drainPromise;
      return { added: 0, duplicates: 0, failed: 0, networkStop: false };
    });

    // Device comes back online — context listens for the 'online' event.
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });

    // The online handler must have kicked off a drain.
    await waitFor(() => expect(drainQueueMock).toHaveBeenCalled());

    // While drain is still in-flight the item must still be in the pending
    // list with status "pending" — it must not be silently lost.
    expect(result.current.pending).toHaveLength(1);
    expect(result.current.pending[0].status).toBe("pending");

    // Unblock the drain so the hook can clean up without open handles.
    resolveDrain();
  });

  it("updates isOnline to false when the browser fires the 'offline' event", async () => {
    mockGetAllPendingScans.mockResolvedValue([]);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isOnline).toBe(true));

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(() => expect(result.current.isOnline).toBe(false));
  });
});

// ---------------------------------------------------------------------------
// processQueue / drainQueue integration
// ---------------------------------------------------------------------------

describe("processQueue via drainQueue callbacks", () => {
  it("accumulates a scan result when drainQueue calls onSuccess", async () => {
    mockGetAllPendingScans.mockResolvedValue([makePending()]);

    const fakePlant = { id: "p1", name: "Brennnessel", image: "data:img" } as unknown as import("@workspace/api-client-react").Plant;

    drainQueueMock.mockImplementation(async (deps: DrainDepsCapture) => {
      deps.onSuccess({ itemId: "item-1", plant: fakePlant, alreadyInArchive: false });
      return { added: 1, duplicates: 0, failed: 0, networkStop: false };
    });

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.results).toHaveLength(1);
    });

    expect(result.current.results[0].itemId).toBe("item-1");
    expect(result.current.results[0].plant).toBe(fakePlant);
    expect(result.current.results[0].alreadyInArchive).toBe(false);
    expect(typeof result.current.results[0].finishedAt).toBe("number");
  });

  it("clearResults empties the results array", async () => {
    const fakePlant = { id: "p1" } as unknown as import("@workspace/api-client-react").Plant;

    drainQueueMock.mockImplementation(async (deps: DrainDepsCapture) => {
      deps.onSuccess({ itemId: "item-1", plant: fakePlant, alreadyInArchive: false });
      return { added: 1, duplicates: 0, failed: 0, networkStop: false };
    });

    mockGetAllPendingScans.mockResolvedValue([makePending()]);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.results).toHaveLength(1));

    act(() => result.current.clearResults());

    expect(result.current.results).toHaveLength(0);
  });

  it("shows an auth toast when drainQueue calls onAuthError", async () => {
    mockGetAllPendingScans.mockResolvedValue([makePending()]);

    drainQueueMock.mockImplementation(async (deps: DrainDepsCapture) => {
      deps.onAuthError();
      return { added: 0, duplicates: 0, failed: 0, networkStop: true };
    });

    renderHook(() => useScanQueue(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });
  });

  it("shows a scan-limit toast and stops when drainQueue calls onScanLimitReached", async () => {
    // Two pending items to confirm only the first triggers the callback and
    // the rest are NOT processed (networkStop = true stops the drain).
    mockGetAllPendingScans.mockResolvedValue([makePending(), makePending()]);

    drainQueueMock.mockImplementation(async (deps: DrainDepsCapture) => {
      deps.onScanLimitReached("2026-07-29T00:00:00.000Z", 15);
      return { added: 0, duplicates: 0, failed: 0, notPlant: 0, networkStop: true };
    });

    renderHook(() => useScanQueue(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Tageslimit erreicht",
          variant: "destructive",
        }),
      );
    });
  });

  it("sets lastDrainAt after processQueue completes", async () => {
    mockGetAllPendingScans.mockResolvedValue([makePending()]);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.lastDrainAt).not.toBeNull();
    });

    expect(typeof result.current.lastDrainAt).toBe("number");
  });

  it("isProcessing is true while drain is in-flight and false once it finishes", async () => {
    mockGetAllPendingScans.mockResolvedValue([makePending()]);

    // Deferred drain: we control exactly when it resolves so we can snapshot
    // isProcessing at both points in time.
    let resolveDrain!: () => void;
    const drainPromise = new Promise<void>((res) => { resolveDrain = res; });
    drainQueueMock.mockImplementation(async () => {
      await drainPromise;
      return { added: 0, duplicates: 0, failed: 0, networkStop: false };
    });

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    // Wait until the mount-triggered drain has started (isProcessing flips true).
    await waitFor(() => expect(result.current.isProcessing).toBe(true));

    // Spinner must be visible while drain is still pending.
    expect(result.current.isProcessing).toBe(true);

    // Unblock the drain and confirm the spinner goes away.
    await act(async () => {
      resolveDrain();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.isProcessing).toBe(false));
  });

  it("isProcessing stays false and drainQueue is not called when the device is offline", async () => {
    // Arrange: device is offline from the start so the mount effect skips the drain too.
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    mockGetAllPendingScans.mockResolvedValue([makePending()]);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    // Let the mount effect settle without triggering a drain.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    drainQueueMock.mockClear();

    // Manually call processQueue while still offline.
    await act(async () => {
      result.current.processQueue();
      await Promise.resolve();
    });

    // The early-exit guard must prevent drainQueue from being called at all.
    expect(drainQueueMock).not.toHaveBeenCalled();
    // isProcessing must remain false — no stuck spinner for offline users.
    expect(result.current.isProcessing).toBe(false);
  });

  it("scheduleFollowUpDrain callback triggers another processQueue call", async () => {
    mockGetAllPendingScans.mockResolvedValue([makePending()]);

    let drainCount = 0;
    drainQueueMock.mockImplementation(async (deps: DrainDepsCapture) => {
      drainCount += 1;
      if (drainCount === 1) {
        // First drain: schedule a follow-up (simulates a photo queued in the
        // narrow window between the loop exit and lock release).
        deps.scheduleFollowUpDrain();
      }
      return { added: 0, duplicates: 0, failed: 0, networkStop: false };
    });

    renderHook(() => useScanQueue(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(drainCount).toBeGreaterThanOrEqual(2);
    });
  });
});

// ---------------------------------------------------------------------------
// pendingCount derived value
// ---------------------------------------------------------------------------

describe("pendingCount", () => {
  it("equals the length of the pending array", async () => {
    const items = [makePending(), makePending(), makePending()];
    mockGetAllPendingScans.mockResolvedValue(items);

    const { result } = renderHook(() => useScanQueue(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(3);
    });
  });
});

// ---------------------------------------------------------------------------
// useScanQueue guard
// ---------------------------------------------------------------------------

describe("useScanQueue guard", () => {
  it("throws when used outside ScanQueueProvider", () => {
    // Suppress the expected React error boundary console.error noise.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useScanQueue())).toThrow(
      "useScanQueue must be used within a ScanQueueProvider",
    );
    spy.mockRestore();
  });
});
