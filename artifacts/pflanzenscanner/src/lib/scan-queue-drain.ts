/**
 * Core drain loop for the scan queue, extracted from scan-queue-context.tsx so
 * it can be unit-tested without a React rendering environment.
 *
 * All side-effects (DB reads/writes, network calls, state updates) are injected
 * via `DrainDeps` so tests can supply fakes without touching global state.
 */

import { isRetryDue, type PendingScan } from "@/lib/scan-queue";
import type { Insect, Plant } from "@workspace/api-client-react";

/** Result of the universal scan: one of the two keys is set. */
export type AutoScanResponse =
  | {
      plant: Plant;
      alreadyInArchive: boolean;
      imageMerged?: boolean | null;
      imageImproved?: boolean | null;
    }
  | { insect: Insect; alreadyInArchive: boolean; imageImproved?: boolean | null };

export interface DrainScanResult {
  itemId: string;
  plant: Plant;
  alreadyInArchive: boolean;
  /** True when a photo was newly attached to an existing entry (Smart Merge). */
  imageMerged?: boolean;
  /** True when this photo was clearly better and replaced the shared one. */
  imageImproved?: boolean;
  /** Device image-store key of the scanned photo (for "Meine Scans"). */
  localImageId?: string;
}

export interface DrainInsectResult {
  itemId: string;
  insect: Insect;
  alreadyInArchive: boolean;
  imageImproved?: boolean;
  localImageId?: string;
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
  /**
   * Optional real reachability check (asks the server). `getIsOnline` only
   * reflects navigator.onLine, which stays true on a signal too weak to carry
   * a request. When this resolves false the drain stops as a network stop
   * and items stay pending.
   */
  checkConnection?: () => Promise<boolean>;
  getAllPendingScans: () => Promise<PendingScan[]>;
  scanPlant: (args: {
    image: string;
    imageSide?: string;
    imageGills?: string;
    localImageId?: string;
    locationRegion?: string;
  }) => Promise<{
    plant: Plant;
    alreadyInArchive: boolean;
    imageMerged?: boolean | null;
    imageImproved?: boolean | null;
  }>;
  /**
   * Sends a queued insect photo. Optional so callers that only queue plants
   * (and older tests) need not provide it; an insect item without it is
   * marked as a permanent error instead of being sent to the plant endpoint.
   */
  scanInsect?: (args: {
    image: string;
    localImageId?: string;
    locationRegion?: string;
  }) => Promise<{ insect: Insect; alreadyInArchive: boolean; imageImproved?: boolean | null }>;
  /**
   * Sends a photo from the universal scan button; the server decides whether
   * it is a plant or an insect. Optional like scanInsect.
   */
  scanAuto?: (args: {
    image: string;
    localImageId?: string;
    locationRegion?: string;
  }) => Promise<AutoScanResponse>;
  /**
   * The universal scan found nothing it can scan (HTTP 422 KEIN_MOTIV) or an
   * animal (TIER_ERKANNT). `message` is the server's explanation.
   */
  onNoSubject?: (itemId: string, message: string) => void;
  onInsectSuccess?: (result: DrainInsectResult) => void;
  /** The server found no insect on the photo (HTTP 422 KEIN_INSEKTEN_FOTO). */
  onNotInsect?: (itemId: string) => void;
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
   * or null if the server didn't include one. `appWide` is true when the app's
   * shared daily budget (not the user's own limit) was used up.
   */
  onScanLimitReached: (
    resetsAt: string | null,
    limit: number | null,
    appWide?: boolean,
  ) => void;
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
    if (deps.checkConnection) {
      // Only probe when there is something to send; an empty queue must not
      // cause a request every 5 seconds.
      const waiting = await deps.getAllPendingScans();
      if (waiting.length > 0 && !(await deps.checkConnection())) {
        networkStop = true;
        return { added, duplicates, failed, notPlant, networkStop };
      }
    }
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
        if (item.kind === "auto") {
          if (!deps.scanAuto) {
            if (await deps.markScanError(item.id, "Der Universal-Scan ist hier nicht verfügbar.", false)) {
              failed += 1;
            }
            continue;
          }
          const autoRes = await deps.scanAuto({
            image: item.image,
            ...(item.localImageId ? { localImageId: item.localImageId } : {}),
            ...(item.locationRegion ? { locationRegion: item.locationRegion } : {}),
          });
          await deps.deletePendingScan(item.id);
          if ("insect" in autoRes) {
            deps.onInsectSuccess?.({
              itemId: item.id,
              insect: autoRes.insect,
              alreadyInArchive: autoRes.alreadyInArchive,
              ...(autoRes.imageImproved ? { imageImproved: true } : {}),
              ...(item.localImageId ? { localImageId: item.localImageId } : {}),
            });
          } else {
            deps.onSuccess({
              itemId: item.id,
              plant: autoRes.plant,
              alreadyInArchive: autoRes.alreadyInArchive,
              imageMerged: autoRes.imageMerged ?? undefined,
              ...(autoRes.imageImproved ? { imageImproved: true } : {}),
              ...(item.localImageId ? { localImageId: item.localImageId } : {}),
            });
            if (autoRes.alreadyInArchive) duplicates += 1;
            else added += 1;
          }
          continue;
        }
        if (item.kind === "insect") {
          if (!deps.scanInsect) {
            if (await deps.markScanError(item.id, "Insekten-Scan ist hier nicht verfügbar.", false)) {
              failed += 1;
            }
            continue;
          }
          const insectRes = await deps.scanInsect({
            image: item.image,
            ...(item.localImageId ? { localImageId: item.localImageId } : {}),
            ...(item.locationRegion ? { locationRegion: item.locationRegion } : {}),
          });
          await deps.deletePendingScan(item.id);
          deps.onInsectSuccess?.({
            itemId: item.id,
            insect: insectRes.insect,
            alreadyInArchive: insectRes.alreadyInArchive,
            ...(insectRes.imageImproved ? { imageImproved: true } : {}),
            ...(item.localImageId ? { localImageId: item.localImageId } : {}),
          });
          // Not counted in the plant stats: those drive plant-specific
          // toasts ("Pflanze bereits gescannt"). The insect page reports
          // its own result via onInsectSuccess.
          continue;
        }
        const res = await deps.scanPlant({
          image: item.image,
          ...(item.imageSide ? { imageSide: item.imageSide } : {}),
          ...(item.imageSide && item.imageGills ? { imageGills: item.imageGills } : {}),
          ...(item.localImageId ? { localImageId: item.localImageId } : {}),
          ...(item.locationRegion ? { locationRegion: item.locationRegion } : {}),
        });
        await deps.deletePendingScan(item.id);
        deps.onSuccess({
          itemId: item.id,
          plant: res.plant,
          alreadyInArchive: res.alreadyInArchive,
          imageMerged: res.imageMerged ?? undefined,
          ...(res.imageImproved ? { imageImproved: true } : {}),
          ...(item.localImageId ? { localImageId: item.localImageId } : {}),
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
        if (
          status === 422 &&
          (err as { data?: { code?: string } } | null)?.data?.code ===
            "KEIN_INSEKTEN_FOTO"
        ) {
          await deps.deletePendingScan(item.id);
          deps.onNotInsect?.(item.id);
          continue;
        }
        const code422 =
          status === 422
            ? (err as { data?: { code?: string } } | null)?.data?.code
            : undefined;
        if (code422 === "KEIN_MOTIV" || code422 === "TIER_ERKANNT") {
          await deps.deletePendingScan(item.id);
          deps.onNoSubject?.(
            item.id,
            (err as { data?: { error?: string } } | null)?.data?.error ??
              "Auf dem Foto wurde nichts zum Scannen erkannt.",
          );
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
          const body = (
            err as {
              data?: { error?: string; resetsAt?: string; limit?: number };
            } | null
          )?.data;
          const resetsAt = body?.resetsAt ?? null;
          const limit = body?.limit ?? null;
          deps.onScanLimitReached(
            resetsAt,
            limit,
            body?.error === "SCAN_BUDGET_REACHED",
          );
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
