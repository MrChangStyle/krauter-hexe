/**
 * Core drain loop for the scan queue, extracted from scan-queue-context.tsx so
 * it can be unit-tested without a React rendering environment.
 *
 * All side-effects (DB reads/writes, network calls, state updates) are injected
 * via `DrainDeps` so tests can supply fakes without touching global state.
 */

import { isRetryDue, type PendingScan } from "@/lib/scan-queue";
import type { Plant } from "@workspace/api-client-react";

export interface DrainScanResult {
  itemId: string;
  plant: Plant;
  alreadyInArchive: boolean;
  /** True when a photo was newly attached to an existing entry (Smart Merge). */
  imageMerged?: boolean;
}

export interface DrainDeps {
  /**
   * The single-flight lock. drainQueue claims it synchronously at the start
   * (before the first await) and releases it in the finally block. Two
   * concurrent callers that share the same lockRef object will never run the
   * loop body simultaneously.
   */
  lockRef: { current: boolean };
  getIsOnline: () => boolean;
  getAllPendingScans: () => Promise<PendingScan[]>;
  scanPlant: (args: {
    image: string;
    imageSide?: string;
    localImageId?: string;
    locationRegion?: string;
  }) => Promise<{ plant: Plant; alreadyInArchive: boolean; imageMerged?: boolean | null }>;
  deletePendingScan: (id: string) => Promise<void>;
  markScanError: (
    id: string,
    message: string,
    autoRetry: boolean,
  ) => Promise<boolean>;
  isNetworkError: (err: unknown) => boolean;
  /** Returns the set of item ids that are already being scanned in memory. */
  getScanningIds: () => Set<string>;
  setScanning: (id: string, on: boolean) => void;
  /**
   * Maximum number of automatic retry attempts for a transiently-failed item
   * before the queue waits for a manual retry.
   */
  maxAutoAttempts: number;
  /** Injectable clock so back-off behaviour is testable. Defaults to Date.now. */
  now?: () => number;
  onSuccess: (result: DrainScanResult) => void;
  /**
   * Called when the server determined the photo contained no plant and
   * discarded it without archiving (HTTP 422 KEIN_PFLANZEN_FOTO).
   */
  onNotPlant: (itemId: string) => void;
  /**
   * Called when a 401/403 stops the drain so the caller can show a re-auth
   * toast / prompt.
   */
  onAuthError: () => void;
  /**
   * Called when a 429 stops the drain because the user has reached their daily
   * scan limit. `resetsAt` is an ISO timestamp of the next Berlin midnight,
   * or null if the server didn't include one.
   */
  onScanLimitReached: (resetsAt: string | null, limit: number | null) => void;
  /**
   * Called after the loop exits without a network stop when there are still
   * pending items in the DB. This lets the tail-drain pick up photos that were
   * enqueued in the narrow window between the loop exiting and the lock
   * releasing.
   */
  scheduleFollowUpDrain: () => void;
}

export interface DrainStats {
  added: number;
  duplicates: number;
  failed: number;
  notPlant: number;
  networkStop: boolean;
}

/**
 * Drain the pending scan queue.
 *
 * Returns immediately (with zeroed stats) when:
 * - Another drain is already running (`lockRef.current === true`), or
 * - The device is offline.
 */
export async function drainQueue(deps: DrainDeps): Promise<DrainStats> {
  // Single-flight guard: claim synchronously (no await before this) so two
  // concurrent callers sharing the same lockRef can never run the loop body at
  // the same time.
  if (deps.lockRef.current) {
    return { added: 0, duplicates: 0, failed: 0, notPlant: 0, networkStop: false };
  }
  if (!deps.getIsOnline()) {
    return { added: 0, duplicates: 0, failed: 0, notPlant: 0, networkStop: false };
  }
  deps.lockRef.current = true;

  let added = 0;
  let duplicates = 0;
  let failed = 0;
  let notPlant = 0;
  let networkStop = false;
  // Each transiently-failed photo is retried at most once per drain so a
  // permanently-failing photo can't spin the loop.
  const attemptedThisDrain = new Set<string>();

  try {
    for (;;) {
      if (!deps.getIsOnline()) {
        networkStop = true;
        break;
      }

      // Re-read from the DB each iteration so items removed or added mid-drain
      // are reflected without re-scanning already-processed ones.
      const items = await deps.getAllPendingScans();
      const now = (deps.now ?? Date.now)();
      const item = items.find(
        (i) =>
          !deps.getScanningIds().has(i.id) &&
          !attemptedThisDrain.has(i.id) &&
          (i.status === "pending" ||
            (i.status === "error" &&
              i.autoRetry === true &&
              i.attempts < deps.maxAutoAttempts &&
              // Respect the growing back-off: an item that failed a moment ago
              // must not be picked up again by the next 5-second drain.
              isRetryDue(i, now))),
      );
      if (!item) break;
      attemptedThisDrain.add(item.id);

      deps.setScanning(item.id, true);
      try {
        const res = await deps.scanPlant({
          image: item.image,
          ...(item.imageSide ? { imageSide: item.imageSide } : {}),
          ...(item.localImageId ? { localImageId: item.localImageId } : {}),
          ...(item.locationRegion ? { locationRegion: item.locationRegion } : {}),
        });
        await deps.deletePendingScan(item.id);
        deps.onSuccess({
          itemId: item.id,
          plant: res.plant,
          alreadyInArchive: res.alreadyInArchive,
          imageMerged: res.imageMerged ?? undefined,
        });
        if (res.alreadyInArchive) duplicates += 1;
        else added += 1;
      } catch (err) {
        if (deps.isNetworkError(err)) {
          // Connection dropped mid-run: leave the item pending and stop.
          networkStop = true;
          break;
        }
        const status = (err as { status?: number } | null)?.status;
        // Photo contained no plant: discard silently, don't count as failure.
        if (
          status === 422 &&
          (err as { data?: { code?: string } } | null)?.data?.code ===
            "KEIN_PFLANZEN_FOTO"
        ) {
          await deps.deletePendingScan(item.id);
          deps.onNotPlant(item.id);
          notPlant += 1;
          continue;
        }
        if (status === 401 || status === 403) {
          // Session expired: keep the photo queued and stop. Every further
          // item would fail the same way.
          networkStop = true;
          deps.onAuthError();
          break;
        }
        if (status === 429) {
          // Daily scan limit reached: pause the drain without marking the item
          // as an error. Leaving it pending means it will be retried
          // automatically after the context's rate-limit gate clears at
          // midnight. Converting to a permanent error here would "poison" the
          // whole queue for the rest of the day and require manual retry.
          const body = (err as { data?: { resetsAt?: string; limit?: number } } | null)?.data;
          const resetsAt = body?.resetsAt ?? null;
          const limit = body?.limit ?? null;
          deps.onScanLimitReached(resetsAt, limit);
          networkStop = true;
          break;
        }
        // Server error. 5xx is transient (auto-retryable); 4xx is permanent.
        const message =
          (err as { data?: { error?: string } } | null)?.data?.error ??
          "Der Scan ist fehlgeschlagen. Bitte versuche es erneut.";
        const transient = typeof status === "number" && status >= 500;
        if (await deps.markScanError(item.id, message, transient)) failed += 1;
      } finally {
        deps.setScanning(item.id, false);
      }
    }
  } finally {
    deps.lockRef.current = false;
  }

  // Tail-drain: a photo enqueued in the narrow window between the loop exiting
  // and the lock releasing won't have been picked up above. Check for it now
  // and let the caller schedule another drain if needed.
  if (!networkStop && deps.getIsOnline()) {
    const remaining = await deps.getAllPendingScans();
    if (remaining.some((i) => i.status === "pending")) {
      deps.scheduleFollowUpDrain();
    }
  }

  return { added, duplicates, failed, notPlant, networkStop };
}
