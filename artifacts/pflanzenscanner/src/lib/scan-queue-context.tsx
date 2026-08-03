import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { scanPlant, type Plant } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  addPendingScan,
  deletePendingScan,
  getAllPendingScans,
  isNetworkError,
  markScanError,
  resetPendingScan,
  findRevivableScans,
  type PendingScan,
} from "@/lib/scan-queue";
import { drainQueue } from "@/lib/scan-queue-drain";

/** Outcome of one successfully scanned queue item. */
export interface ScanResult {
  /** Queue item id this result belongs to (correlates result and capture). */
  itemId: string;
  plant: Plant;
  alreadyInArchive: boolean;
  /** True when a photo was newly attached to an existing entry (Smart Merge). */
  imageMerged?: boolean;
  /** Epoch ms when the scan finished (lets consumers ignore stale results). */
  finishedAt: number;
}

/** Outcome when the server determined the photo contained no plant. */
export interface NotPlantResult {
  itemId: string;
  finishedAt: number;
}

interface ScanQueueContextValue {
  /** All queued photos, oldest first. */
  pending: PendingScan[];
  pendingCount: number;
  /** Ids currently being scanned (in-memory only, never persisted). */
  scanningIds: Set<string>;
  isOnline: boolean;
  isProcessing: boolean;
  /**
   * True when the last drain stopped because the server returned 401/403.
   * Cleared automatically on the next successful drain. The scan page watches
   * this to clear its spinner and prompt the user to re-authenticate.
   */
  isAuthBlocked: boolean;
  /**
   * ISO timestamp of the next Berlin midnight when the daily scan quota resets,
   * or null when the quota is not exhausted. While this is set and in the
   * future the queue deliberately does not drain, so the UI must surface it —
   * otherwise queued photos appear to "wait" for no reason.
   */
  rateLimitResetsAt: string | null;
  /**
   * Results of recently drained scans, oldest first. The scan page consumes
   * (displays and then clears) these to show the result preview - including
   * after a mid-scan page reload, because the photo survives in the queue and
   * is rescanned on boot.
   */
  results: ScanResult[];
  clearResults: () => void;
  /** Items that were discarded because the photo contained no plant. */
  notPlantResults: NotPlantResult[];
  clearNotPlantResults: () => void;
  /** Epoch ms when the last drain finished (null until one has run). */
  lastDrainAt: number | null;
  /**
   * Persist a photo into the queue and return its queue id. When online, the
   * scan starts immediately. `imageSide` carries Bild 2 (von der Seite) of
   * the two-photo mushroom scan. `localImageId` / `localImageSideId` are the
   * IndexedDB image-store keys for the local-first migration.
   */
  enqueue: (
    image: string,
    imageSide?: string,
    localImageId?: string,
    locationRegion?: string,
  ) => Promise<string>;
  /** Manually kick off processing (e.g. a "scan now" button). */
  processQueue: () => void;
  /** Remove a queued photo without scanning it. */
  remove: (id: string) => Promise<void>;
  /**
   * Reset an item (failed OR still waiting) to a clean pending state and try
   * scanning it again right away. Clears the attempt counter and every gate
   * (auth block, daily-quota pause), because an explicit user action overrides
   * the queue's own back-off heuristics.
   */
  retry: (id: string) => Promise<void>;
  /** Re-read the queue from storage (e.g. when opening the queue page). */
  refresh: () => Promise<PendingScan[]>;
}

const ScanQueueContext = createContext<ScanQueueContextValue | null>(null);

// How often a transiently-failed photo (server 5xx / AI hiccup) is retried
// automatically before it waits for a manual retry. Bounds wasted API calls on
// photos that keep failing while still recovering from short-lived outages
// (e.g. a server cold start right after publishing).
export const MAX_AUTO_ATTEMPTS = 3;

export function getIsOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function ScanQueueProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingScan[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(getIsOnline());
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<ScanResult[]>([]);
  const [notPlantResults, setNotPlantResults] = useState<NotPlantResult[]>([]);
  const [lastDrainAt, setLastDrainAt] = useState<number | null>(null);
  const [isAuthBlocked, setIsAuthBlocked] = useState(false);
  // ISO timestamp of the next Berlin midnight when the daily scan limit resets.
  // While this is set and in the future, processQueue exits immediately so that
  // queued items are not poisoned by repeated 429s during the rate-limited window.
  const [rateLimitResetsAt, setRateLimitResetsAt] = useState<string | null>(null);
  const processingRef = useRef(false);
  const scanningIdsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const items = await getAllPendingScans();
    setPending(items);
    return items;
  }, []);

  const setScanning = useCallback((id: string, on: boolean) => {
    if (on) scanningIdsRef.current.add(id);
    else scanningIdsRef.current.delete(id);
    // New Set instance so React sees the change.
    setScanningIds(new Set(scanningIdsRef.current));
  }, []);

  // Auto-clear the rate-limit gate once the reset time arrives so the queue
  // drains automatically at midnight without requiring a page reload.
  useEffect(() => {
    if (!rateLimitResetsAt) return;
    const msUntilReset = new Date(rateLimitResetsAt).getTime() - Date.now();
    if (msUntilReset <= 0) {
      setRateLimitResetsAt(null);
      return;
    }
    const tid = window.setTimeout(() => setRateLimitResetsAt(null), msUntilReset);
    return () => window.clearTimeout(tid);
  }, [rateLimitResetsAt]);

  const processQueue = useCallback(async () => {
    // Guard: drainQueue will immediately return if the lock is already held or
    // the device is offline, but we also skip the setIsProcessing overhead.
    if (processingRef.current) return;
    if (!getIsOnline()) return;
    // Auth-block gate: the server returned 401. Stop retrying automatically
    // so we don't spam the endpoint. The block clears when the user enqueues
    // a new photo (proving they just logged in) or manually retries an item.
    if (isAuthBlocked) return;
    // Rate-limit gate: stop attempting until the daily quota resets at midnight.
    if (rateLimitResetsAt && new Date(rateLimitResetsAt).getTime() > Date.now()) return;

    setIsProcessing(true);
    let stats: { added: number; duplicates: number; failed: number; notPlant: number } = {
      added: 0,
      duplicates: 0,
      failed: 0,
      notPlant: 0,
    };

    try {
      stats = await drainQueue({
        lockRef: processingRef,
        getIsOnline,
        getAllPendingScans,
        scanPlant,
        deletePendingScan,
        markScanError,
        isNetworkError,
        getScanningIds: () => scanningIdsRef.current,
        setScanning,
        maxAutoAttempts: MAX_AUTO_ATTEMPTS,
        onSuccess: (result) => {
          // A successful scan clears any previous auth-block state.
          setIsAuthBlocked(false);
          // Keep a bounded list so a huge backlog can't grow memory forever.
          setResults((prev) => [
            ...prev.slice(-19),
            { ...result, finishedAt: Date.now() },
          ]);
          void refresh();
        },
        onNotPlant: (itemId) => {
          setIsAuthBlocked(false);
          setNotPlantResults((prev) => [
            ...prev.slice(-19),
            { itemId, finishedAt: Date.now() },
          ]);
          void refresh();
        },
        onAuthError: () => {
          setIsAuthBlocked(true);
          toast({
            title: "Anmeldung erforderlich",
            description:
              "Bitte melde dich neu an – deine Fotos bleiben gespeichert.",
            variant: "destructive",
          });
        },
        onScanLimitReached: (resetsAt, limit) => {
          // Store the reset time so processQueue gates itself until midnight
          // instead of hammering the server with repeated 429 responses.
          setRateLimitResetsAt(resetsAt);
          const resetTime = resetsAt
            ? new Intl.DateTimeFormat("de-DE", {
                timeZone: "Europe/Berlin",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(resetsAt)) + " Uhr"
            : "Mitternacht";
          const limitText = limit != null ? ` (${limit} Fotos pro Tag)` : "";
          toast({
            title: "Tageslimit erreicht",
            description: `Du hast heute das Scan-Limit erreicht${limitText}. Dein Kontingent wird um ${resetTime} zurückgesetzt.`,
            variant: "destructive",
          });
        },
        scheduleFollowUpDrain: () => {
          void processQueue();
        },
      });
    } finally {
      setIsProcessing(false);
      setLastDrainAt(Date.now());
      await refresh();
    }

    const { added, duplicates, notPlant } = stats;

    if (added > 0 || duplicates > 0) {
      // A queued scan created (or matched) an archive entry - refresh the views.
      void queryClient.invalidateQueries();
    }

    if (added > 0 || duplicates > 0 || notPlant > 0) {
      // Duplicate notifications always fire regardless of which page is open,
      // because the scan page suppresses result toasts to avoid redundancy with
      // its own navigation, but the user must always learn about duplicates.
      if (duplicates > 0) {
        toast({
          title: "Pflanze wurde bereits von dir gescannt",
          description:
            "Diese Pflanze ist bereits im Archiv vorhanden und wurde deinem Bereich hinzugefügt.",
        });
      }

      // Failed scans are deliberately NOT toasted: they stay silently in the
      // queue (auto-retried, visible under /warteschlange). New-plant success
      // and non-plant photos are only toasted away from the scan page - on the
      // scan page the navigation / inline message is the feedback.
      const onScanPage = window.location.pathname === import.meta.env.BASE_URL;
      if (!onScanPage && (added > 0 || notPlant > 0)) {
        const parts: string[] = [];
        if (added > 0) parts.push(`${added} neu hinzugefügt`);
        if (notPlant > 0)
          parts.push(
            notPlant === 1
              ? "1 Foto enthielt keine Pflanze"
              : `${notPlant} Fotos enthielten keine Pflanze`,
          );
        toast({
          title: "Scan-Ergebnis",
          description: parts.join(" · "),
        });
      }
    }
  }, [queryClient, rateLimitResetsAt, refresh, setScanning, toast]);

  const enqueue = useCallback(
    async (
      image: string,
      imageSide?: string,
      localImageId?: string,
      locationRegion?: string,
    ) => {
      // A new photo means the user just interacted with the app — they are
      // almost certainly logged in. Clear any stale auth block so the
      // subsequent processQueue() call in scan.tsx isn't silently gated.
      setIsAuthBlocked(false);
      const item = await addPendingScan(image, imageSide, localImageId, locationRegion);
      await refresh();
      // NOTE: processQueue is intentionally NOT called here. The scan page
      // calls processQueue() itself AFTER setting waitingForItemId, which
      // prevents the race condition where a fast server response (e.g. 422)
      // arrives before waitingForItemId is set and triggers a premature error.
      // Background drains (boot, online event, 5s interval) handle items that
      // come from other sources (retries, previous sessions).
      return item.id;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await deletePendingScan(id);
      await refresh();
    },
    [refresh],
  );

  const retry = useCallback(
    async (id: string) => {
      // Full reset (attempts back to 0), so an item that already burned through
      // MAX_AUTO_ATTEMPTS becomes auto-retryable again instead of needing a
      // manual press for every single further attempt.
      if (!(await resetPendingScan(id))) return;
      await refresh();
      // A manual retry clears every gate: the user has presumably
      // re-authenticated / waited out the quota and explicitly wants to try
      // again. If the block is still real the next response re-arms it.
      setIsAuthBlocked(false);
      setRateLimitResetsAt(null);
      if (getIsOnline()) void processQueue();
    },
    [processQueue, refresh],
  );

  useEffect(() => {
    void refresh().then((items) => {
      if (items.some((i) => i.status === "pending") && getIsOnline()) {
        void processQueue();
      }
    });

    const handleOnline = () => {
      setIsOnline(true);
      void processQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Safety net: `navigator.onLine` can be a false negative and the `online`
    // event doesn't always fire. Sync the React state and retry periodically
    // so a momentary false-negative (e.g. during HMR remount) doesn't leave
    // the UI stuck in "offline" mode indefinitely.
    const interval = window.setInterval(() => {
      const online = getIsOnline();
      setIsOnline(online);
      if (online) void processQueue();
    }, 5_000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(interval);
    };
  }, [processQueue, refresh]);

  // Watchdog: items that used up their automatic attempts would otherwise sit in
  // the queue forever waiting for a manual press. Once they have rested for the
  // back-off window, reset them to "pending" and drain again. This is what makes
  // a queue recover on its own from a temporary outage (server cold start,
  // exhausted daily quota, expired session) without any user interaction.
  useEffect(() => {
    const reviveStuckItems = async () => {
      if (!getIsOnline() || processingRef.current) return;
      if (isAuthBlocked) return;
      if (rateLimitResetsAt && new Date(rateLimitResetsAt).getTime() > Date.now()) {
        return;
      }
      const items = await getAllPendingScans();
      const revivable = findRevivableScans(items, Date.now(), MAX_AUTO_ATTEMPTS);
      if (revivable.length === 0) return;
      await Promise.all(
        revivable.map((i) => resetPendingScan(i.id, { countAsRevival: true })),
      );
      await refresh();
      void processQueue();
    };

    void reviveStuckItems();
    const tid = window.setInterval(() => void reviveStuckItems(), 60_000);
    return () => window.clearInterval(tid);
  }, [isAuthBlocked, processQueue, rateLimitResetsAt, refresh]);

  const clearResults = useCallback(() => setResults([]), []);
  const clearNotPlantResults = useCallback(() => setNotPlantResults([]), []);

  const value: ScanQueueContextValue = {
    pending,
    pendingCount: pending.length,
    scanningIds,
    isOnline,
    isProcessing,
    isAuthBlocked,
    rateLimitResetsAt,
    results,
    clearResults,
    notPlantResults,
    clearNotPlantResults,
    lastDrainAt,
    enqueue,
    processQueue: () => {
      void processQueue();
    },
    remove,
    retry,
    refresh,
  };

  return (
    <ScanQueueContext.Provider value={value}>{children}</ScanQueueContext.Provider>
  );
}

export function useScanQueue(): ScanQueueContextValue {
  const ctx = useContext(ScanQueueContext);
  if (!ctx) {
    throw new Error("useScanQueue must be used within a ScanQueueProvider");
  }
  return ctx;
}
