import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Camera,
  Leaf,
  Loader2,
  AlertCircle,
  Bug,
  Clock,
  WifiOff,
  Trophy,
  Info,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MAX_AUTO_ATTEMPTS, useScanQueue, getIsOnline } from "@/lib/scan-queue-context";
import { Progress } from "@/components/ui/progress";
import { useScanInsect, useGetLeaderboard, useListCareGuides } from "@workspace/api-client-react";
import type { LeaderboardEntry, CareGuide } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  getMushroomDraft,
  putMushroomDraft,
  clearMushroomDraft,
} from "@/lib/scan-queue";
import { downscaleFile, downscaleScan } from "@/lib/image";
import { useLocationRegion } from "@/lib/use-location-region";
import { LocationCard } from "@/components/location-card";
import { putImage } from "@/lib/image-store";

// Which capture the hidden file input is currently serving: the normal
// single-photo plant scan, the insect scan, or one of the two steps of the
// Pilz-Scan (Bild 1: von oben, Bild 2: von der Seite).
type CaptureMode = "plant" | "insect" | "mushroomTop" | "mushroomSide";

// Prepared scan waiting for the user to confirm (preview step).
type ScanPreview = {
  image: string;
  topImage: string | null;
  localImageId: string | undefined;
  mode: CaptureMode;
  phase: "idle" | "counting";
  countdown: number;
  locationRegion: string | undefined;
};

/** Format an ISO timestamp as "HH:mm Uhr" in the Europe/Berlin timezone. */
function formatBerlinTime(iso: string | null): string {
  if (!iso) return "Mitternacht";
  return (
    new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso)) + " Uhr"
  );
}

// ── Leaderboard section ───────────────────────────────────────────────────────

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-500 text-base">🥇</span>;
  if (rank === 2) return <span className="text-slate-400 text-base">🥈</span>;
  if (rank === 3) return <span className="text-amber-600 text-base">🥉</span>;
  return <span className="text-xs text-muted-foreground tabular-nums w-5 text-center">{rank}</span>;
}

export function LeaderboardSection({ className }: { className?: string } = {}) {
  const { data, isLoading } = useGetLeaderboard();
  const [showInfo, setShowInfo] = useState(false);

  if (isLoading) return null;
  if (!data || data.top.length === 0) return null;

  // Show top 5 entries; if the current user is outside the top 5 append their
  // own row with a visual separator so it is always visible.
  const topFive: LeaderboardEntry[] = data.top.slice(0, 5);
  const ownOutsideTop = data.own && !topFive.find((e) => e.isCurrentUser);

  return (
    <div className={cn("w-full max-w-sm mt-2", className)}>
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-yellow-500" />
        <h2 className="text-sm font-semibold">Pflanzenretter-Rangliste</h2>
        <button
          onClick={() => setShowInfo((v) => !v)}
          className="ml-auto p-1 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          aria-label="Info zu Blättern"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>
      {showInfo && (
        <div className="mb-3 rounded-xl border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-900 dark:text-emerald-200 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          <p className="font-semibold flex items-center gap-1.5">
            <Leaf className="w-3.5 h-3.5 text-emerald-600" />
            So verdienst du Blätter 🌿
          </p>
          <ul className="space-y-1 pl-1">
            <li>📷 <strong>+1 Blatt</strong> für jede neu gescannte Pflanze im Archiv</li>
            <li>🍄 <strong>+1 Blatt</strong> für jeden neu gescannten Pilz</li>
            <li>🐛 <strong>+1 Blatt</strong> für jedes neu bestimmte Insekt</li>
            <li>✅ <strong>+1 Blatt</strong> pro abgehaktem Pflegetag in der Pflegeanleitung</li>
          </ul>
          <p className="text-emerald-700 dark:text-emerald-400">Bereits bekannte Arten zählen nicht noch einmal.</p>
        </div>
      )}
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        {topFive.map((entry, idx) => (
          <div
            key={entry.userId}
            className={cn(
              "flex items-center gap-3 px-3 py-2 border-b last:border-b-0",
              entry.isCurrentUser && "bg-emerald-50 dark:bg-emerald-950/20",
              idx === 0 && "bg-yellow-50/60 dark:bg-yellow-950/20",
            )}
          >
            <RankMedal rank={entry.rank} />
            <span className={cn(
              "flex-1 text-sm font-mono tracking-wide truncate",
              entry.isCurrentUser && "font-bold text-emerald-700 dark:text-emerald-400",
            )}>
              {entry.username}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Leaf className="w-3 h-3 text-emerald-500" />
              {entry.leavesCount}
            </span>
          </div>
        ))}
        {/* Always show own row when outside top 5 */}
        {ownOutsideTop && data.own && (
          <>
            <div className="border-b border-dashed" />
            <div className="flex items-center gap-3 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20">
              <RankMedal rank={data.own.rank} />
              <span className="flex-1 text-sm font-mono tracking-wide truncate font-bold text-emerald-700 dark:text-emerald-400">
                {data.own.username}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <Leaf className="w-3 h-3 text-emerald-500" />
                {data.own.leavesCount}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Leaf progress ring ────────────────────────────────────────────────────────

function LeafRing({ count, onClick }: { count: number; onClick?: () => void }) {
  // Progress = position within the current decade (0 → 10 → 20 …)
  const progress = count <= 0 ? 0 : (count % 10) / 10 || 1; // full ring at multiples of 10
  const r = 42;
  const circumference = 2 * Math.PI * r; // ≈ 263.9
  const offset = circumference * (1 - progress);

  return (
    <button
      onClick={onClick}
      aria-label={`${count} Blätter – zur Rangliste`}
      className="relative w-[52px] h-[52px] shrink-0 bg-card rounded-full shadow-sm border border-border flex items-center justify-center active:scale-95 transition-transform hover:shadow-md"
    >
      <svg
        className="absolute inset-0 w-full h-full -rotate-90"
        viewBox="0 0 100 100"
      >
        <circle cx="50" cy="50" r={r} stroke="currentColor" strokeWidth="6" fill="none"
          className="text-muted/40" />
        <circle cx="50" cy="50" r={r} stroke="currentColor" strokeWidth="6" fill="none"
          className="text-emerald-600 dark:text-emerald-400"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round" />
      </svg>
      <div className="relative flex flex-col items-center justify-center leading-none">
        <Leaf className="w-3 h-3 text-emerald-700 dark:text-emerald-400 mb-[1px]" strokeWidth={2.5} />
        <span className="text-[10px] font-bold text-emerald-900 dark:text-emerald-200 tabular-nums">
          {count}
        </span>
      </div>
    </button>
  );
}

// ── Dynamic greeting header ───────────────────────────────────────────────────

function GreetingHeader({
  username,
  leavesCount,
  pendingGuide,
  onLeafClick,
}: {
  username: string;
  leavesCount: number;
  pendingGuide: CareGuide | undefined;
  onLeafClick: () => void;
}) {
  const contextLine = pendingGuide
    ? `Deine ${pendingGuide.plantName} braucht heute Pflege! 🌱`
    : "Zeit für einen Waldspaziergang! 🌿";

  return (
    <div className="w-full max-w-sm flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="inline-flex items-center px-2.5 py-0.5 mb-2 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest font-serif">
          Kräuterhexe
        </span>
        <h1 className="text-xl font-medium text-foreground mb-1 leading-snug">
          Hallo{" "}
          <span className="font-mono font-bold tracking-tight">
            {username}
          </span>{" "}
          👋
        </h1>
        <p className="text-[13px] text-muted-foreground font-medium">
          {contextLine}
        </p>
      </div>
      <LeafRing count={leavesCount} onClick={onLeafClick} />
    </div>
  );
}

export default function ScanPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const leaderboardRef = useRef<HTMLDivElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { user } = useAuthContext();
  // "insect" → show amber insect-specific error card; "plant" → red plant error
  const [errorKind, setErrorKind] = useState<"plant" | "insect">("plant");
  const [isPreparing, setIsPreparing] = useState(false);
  // Tracks whether the current preparation is for an insect (changes spinner label).
  const [preparingMode, setPreparingMode] = useState<"plant" | "insect">("plant");

  // Care guides — used to build the contextual greeting line.
  const { data: careGuidesData } = useListCareGuides();
  const pendingCareGuide = careGuidesData?.find(
    (g) => g.status === "Aktiv" && g.completedDays.length < g.dailyPlan.length,
  );

  // Monotonic id so a newer capture supersedes any in-flight one: stale async
  // callbacks bail out instead of clobbering the latest capture.
  const captureIdRef = useRef(0);
  const captureModeRef = useRef<CaptureMode>("plant");

  // Bild 1 of a Pilz-Scan in progress; mirrored in IndexedDB so it survives
  // the page reload low-memory phones do right after the camera closes.
  const [mushroomTop, setMushroomTop] = useState<string | null>(null);
  // True while the "Erstes Foto von oben" hint card is shown (before the
  // camera opens for step 1 of a Pilz-Scan).
  const [showMushroomTopHint, setShowMushroomTopHint] = useState(false);
  // True while the camera/gallery choice card is shown for plant or insect.
  const [showPlantOptions, setShowPlantOptions] = useState(false);
  const [showInsectOptions, setShowInsectOptions] = useState(false);
  const mushroomTopRef = useRef<string | null>(null);
  useEffect(() => {
    mushroomTopRef.current = mushroomTop;
  }, [mushroomTop]);

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  // When online, we track the queued item and navigate to the result once done.
  const [waitingForItemId, setWaitingForItemId] = useState<string | null>(null);
  // Simulated scan progress (0-100). The server gives no real progress signal,
  // so the bar advances with elapsed time and slows down as it approaches 95%.
  // It keeps moving through automatic retries, so on flaky connections the
  // user still sees how far along the scan is before it hands over to the
  // queue. 100% is set right before navigating to the result.
  const [scanProgress, setScanProgress] = useState(0);
  // Prepared scan waiting for user confirmation before the analysis fires.
  const [preview, setPreview] = useState<ScanPreview | null>(null);

  const {
    enqueue,
    processQueue,
    isOnline,
    isAuthBlocked,
    results,
    clearResults,
    notPlantResults,
    clearNotPlantResults,
    pending,
    pendingCount,
  } = useScanQueue();

  const { logout } = useAuthContext();

  const loc = useLocationRegion();

  // Ref holds the latest execute-analysis function so the countdown useEffect
  // can always call the freshest closure without being in its dependency array.
  const executeAnalysisRef = useRef<((p: ScanPreview) => void) | null>(null);
  executeAnalysisRef.current = (p: ScanPreview): void => {
    if (p.mode === "insect") {
      scanInsect({
        data: {
          image: p.image,
          ...(p.localImageId ? { localImageId: p.localImageId } : {}),
          ...(p.locationRegion ? { locationRegion: p.locationRegion } : {}),
        },
      });
      return;
    }
    // plant or mushroomSide: enqueue then track progress.
    void (async () => {
      let itemId: string;
      try {
        itemId = p.topImage
          ? await enqueue(p.topImage, p.image, p.localImageId, p.locationRegion)
          : await enqueue(p.image, undefined, p.localImageId, p.locationRegion);
      } catch {
        setErrorKind("plant");
        setErrorMsg(
          "Das Foto konnte nicht gespeichert werden. Bitte versuche es erneut.",
        );
        return;
      }
      if (p.topImage) {
        captureModeRef.current = "plant";
        setMushroomTop(null);
        void clearMushroomDraft().catch(() => {});
      }
      // Use the live navigator.onLine check (not the potentially stale React
      // isOnline state) so we don't start the loading spinner when offline.
      if (getIsOnline()) {
        // IMPORTANT: setWaitingForItemId BEFORE processQueue so that if the
        // server responds synchronously-fast (e.g. 422), the notPlantResults
        // effect already has a waitingForItemId to match against and won't
        // silently accumulate stale results that match the next scan.
        setWaitingForItemId(itemId);
        processQueue();
      } else {
        toast({
          title: "Du bist offline",
          description:
            "Der Scan wurde gespeichert und wird automatisch verarbeitet, sobald du wieder verbunden bist.",
        });
        resetToStart();
      }
    })();
  };

  // Insect scan — direct POST, no queue.
  const { mutate: scanInsect, isPending: isInsectScanning } = useScanInsect({
    mutation: {
      onSuccess(data) {
        if (data.alreadyInArchive) {
          toast({
            title: "Insekt bereits bekannt",
            description: `${data.insect.germanName} ist bereits in deinem Archiv.`,
          });
        } else {
          toast({
            title: "Neues Insekt entdeckt! 🌿",
            description: `+1 Blatt für ${data.insect.germanName}.`,
          });
        }
        setLocation(`/insekt/${data.insect.id}`);
      },
      onError(err) {
        const apiErr = err as {
          status?: number;
          data?: { error?: string; code?: string; resetsAt?: string; limit?: number };
        } | null;
        if (apiErr?.status === 429) {
          const limitText = apiErr?.data?.limit != null ? ` (${apiErr.data.limit} Fotos pro Tag)` : "";
          toast({
            title: "Tageslimit erreicht",
            description: `Du hast heute das Scan-Limit erreicht${limitText}. Dein Kontingent wird um ${formatBerlinTime(apiErr?.data?.resetsAt ?? null)} zurückgesetzt.`,
            variant: "destructive",
          });
          return;
        }
        const code = apiErr?.data?.code;
        if (code === "KEIN_INSEKTEN_FOTO") {
          setErrorKind("insect");
          setErrorMsg(
            "Auf dem Foto ist kein Insekt zu sehen. Bitte fotografiere ein Insekt, eine Spinne oder ein anderes Gliedertier – keine Pflanzen oder anderen Tiere.",
          );
        } else {
          setErrorKind("insect");
          setErrorMsg(
            apiErr?.data?.error ??
              "Die Insekten-Bestimmung hat nicht geklappt. Bitte versuche es erneut.",
          );
        }
      },
    },
  });

  // Advance the simulated progress bar while a plant scan is in flight.
  // Time-based easing: fast at the start, slowing down towards 95% so the bar
  // never claims completion before the result arrives.
  useEffect(() => {
    if (!waitingForItemId) return;
    setScanProgress(4);
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      // Exponential approach to 95%: ~55% at 10s, ~79% at 20s, ~93% at 45s.
      const target = 95 * (1 - Math.exp(-elapsed / 12));
      setScanProgress((prev) => Math.max(prev, Math.min(95, target)));
    }, 250);
    return () => window.clearInterval(interval);
  }, [waitingForItemId]);

  // When a result arrives for our pending plant scan, navigate to the detail page.
  useEffect(() => {
    if (!waitingForItemId) return;
    const match = results.find((r) => r.itemId === waitingForItemId);
    if (!match) return;
    clearResults();
    setWaitingForItemId(null);
    setScanProgress(100);
    // Smart Merge: an existing entry had no image — the new scan just restored it.
    if (match.imageMerged) {
      toast({
        title: "Bild wiederhergestellt! 🌿",
        description: `Das Foto wurde deinem bestehenden Eintrag „${match.plant.germanName}" hinzugefügt.`,
      });
    }
    setLocation(`/pflanze/${match.plant.id}`);
  }, [results, waitingForItemId, clearResults, setLocation, toast]);

  // When the server discarded the photo because it contained no plant, show
  // a friendly message and reset so the user can try again.
  useEffect(() => {
    if (!waitingForItemId) return;
    const match = notPlantResults.find((r) => r.itemId === waitingForItemId);
    if (!match) return;
    clearNotPlantResults();
    setWaitingForItemId(null);
    setScanProgress(0);
    setIsPreparing(false);
    setErrorKind("plant");
    setErrorMsg(
      "Auf dem Foto ist keine Pflanze zu sehen. Bitte fotografiere eine Pflanze, ein Kraut, einen Pilz oder einen Baum.",
    );
  }, [notPlantResults, waitingForItemId, clearNotPlantResults]);

  // If the scan we're waiting for keeps failing, don't show a warning: the
  // photo stays silently in the queue (auto-retried in the background,
  // visible unter /warteschlange). We only stop the spinner once the item
  // has exhausted its automatic retries or failed permanently - while it is
  // still auto-retrying, the scan simply keeps running.
  useEffect(() => {
    if (!waitingForItemId) return;
    const item = pending.find((p) => p.id === waitingForItemId);
    if (!item || item.status !== "error") return;
    const willAutoRetry =
      item.autoRetry === true && item.attempts < MAX_AUTO_ATTEMPTS;
    if (willAutoRetry) return;
    // Silently hand over to the queue - no error message.
    setWaitingForItemId(null);
    setScanProgress(0);
    setErrorMsg(null);
    setIsPreparing(false);
  }, [pending, waitingForItemId]);

  // If the network drops while we're waiting for a scan result, the drain
  // will have stopped and the item stays pending indefinitely. Hand the scan
  // back to the queue, show a friendly offline notice, and let the background
  // drain pick it up once connectivity returns.
  useEffect(() => {
    if (!waitingForItemId || isOnline) return;
    toast({
      title: "Du bist offline",
      description:
        "Der Scan wurde gespeichert und wird automatisch verarbeitet, sobald du wieder verbunden bist.",
    });
    setWaitingForItemId(null);
    setScanProgress(0);
    setIsPreparing(false);
  }, [isOnline, waitingForItemId, toast]);

  // The server returned 401/403 while we were waiting for a scan result.
  // This means the session has expired (the frontend cached identity is stale).
  // Clear the spinner and drop the stale identity, which puts the login screen
  // back up; their queued photo is safe and will be processed after they log
  // back in.
  useEffect(() => {
    if (!isAuthBlocked || !waitingForItemId) return;
    setWaitingForItemId(null);
    setScanProgress(0);
    setIsPreparing(false);
    logout();
  }, [isAuthBlocked, waitingForItemId, logout]);

  // Restore Bild 1 of an unfinished Pilz-Scan (e.g. after the page reload
  // low-memory phones do right after the camera) so step 2 can continue.
  useEffect(() => {
    getMushroomDraft()
      .then((draft) => {
        if (draft) setMushroomTop(draft.image);
      })
      .catch(() => {
        // No draft available (e.g. private mode): the Pilz-Scan starts fresh.
      });
  }, []);

  // Countdown: decrement once/second and fire the analysis when it hits 0.
  useEffect(() => {
    if (!preview || preview.phase !== "counting") return;
    if (preview.countdown > 0) {
      const tid = window.setTimeout(() => {
        setPreview((p) => (p ? { ...p, countdown: p.countdown - 1 } : null));
      }, 1000);
      return () => window.clearTimeout(tid);
    }
    // Countdown reached 0: fire the analysis (no cleanup needed).
    const snap = preview;
    setPreview(null);
    executeAnalysisRef.current?.(snap);
    return undefined;
  }, [preview]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetToStart = () => {
    setErrorMsg(null);
    setIsPreparing(false);
    setShowMushroomTopHint(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Supersede any capture still being prepared.
    const myId = ++captureIdRef.current;
    const isStale = () => captureIdRef.current !== myId;

    const mode = captureModeRef.current;
    setErrorMsg(null);
    setIsPreparing(true);
    setPreparingMode(mode === "insect" ? "insect" : "plant");

    void (async () => {
      let image: string;
      try {
        // Scan path: 900 px WebP-first for fast upload to Gemini (~3× smaller
        // than the previous 1280 px JPEG). Insect uses the same path; the
        // larger 1280 px version is kept only for pages that don't call the AI
        // (PDF export, plant-detail "Bild hinzufügen", etc.).
        image = mode === "insect"
          ? await downscaleFile(file, 1280, 0.72)   // insect: full quality for display
          : await downscaleScan(file);              // plant/mushroom: 900 px WebP scan
      } catch {
        if (!isStale()) {
          setIsPreparing(false);
          setErrorKind(mode === "insect" ? "insect" : "plant");
          setErrorMsg("Fehler beim Lesen des Bildes.");
        }
        return;
      }
      if (isStale()) return;

      // ── Insect branch ──────────────────────────────────────────────────────
      if (mode === "insect") {
        setIsPreparing(false);
        // Only pass localImageId to the server when the local write succeeds.
        // If putImage throws (quota exceeded, private browsing, etc.) the server
        // will receive no localImageId and will store imageData as a fallback so
        // the image is never silently lost.
        let localImageId: string | undefined;
        try {
          const id = crypto.randomUUID();
          await putImage(id, image);
          localImageId = id;
        } catch { /* local write failed – server falls back to imageData */ }
        const locationRegionInsect = (await loc.askForLocation()) ?? undefined;
        if (isStale()) return;
        setPreview({
          image,
          topImage: null,
          localImageId,
          mode: "insect",
          phase: "idle",
          countdown: 5,
          locationRegion: locationRegionInsect,
        });
        return;
      }

      // ── Plant / mushroom branches ──────────────────────────────────────────
      if (mode === "mushroomTop") {
        try {
          await putMushroomDraft(image);
        } catch {
          // Draft not persistable (e.g. private mode): continue in memory.
        }
        if (isStale()) return;
        setIsPreparing(false);
        setMushroomTop(image);
        return;
      }

      const topImage = mode === "mushroomSide" ? mushroomTopRef.current : null;
      if (mode === "mushroomSide" && !topImage) {
        captureModeRef.current = "plant";
        setIsPreparing(false);
        setErrorKind("plant");
        setErrorMsg("Das erste Pilz-Foto fehlt. Bitte starte den Pilz-Scan neu.");
        return;
      }

      // Only pass localImageId to the server when the local write succeeds.
      // If putImage throws, omit localImageId so the server stores imageData.
      let localImageId: string | undefined;
      try {
        const id = crypto.randomUUID();
        await putImage(id, topImage ?? image);
        if (topImage) await putImage(`${id}-side`, image);
        localImageId = id;
      } catch { /* local write failed – server falls back to imageData */ }

      const locationRegion = (await loc.askForLocation()) ?? undefined;
      if (isStale()) return;

      setIsPreparing(false);
      setPreview({
        image,
        topImage: topImage ?? null,
        localImageId,
        mode,
        phase: "idle",
        countdown: 5,
        locationRegion,
      });
    })();
  };

  const openCamera = (mode: CaptureMode = "plant") => {
    captureModeRef.current = mode;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.setAttribute("capture", "environment");
      fileInputRef.current.click();
    }
  };

  const openGallery = (mode: CaptureMode = "plant") => {
    captureModeRef.current = mode;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.removeAttribute("capture");
      fileInputRef.current.click();
    }
  };

  const cancelMushroomScan = () => {
    captureModeRef.current = "plant";
    setMushroomTop(null);
    setShowMushroomTopHint(false);
    void clearMushroomDraft().catch(() => {});
  };

  const isLoading = isPreparing || !!waitingForItemId || isInsectScanning;

  return (
    <div className="flex flex-col h-full items-center justify-start pt-10 px-6 pb-6 gap-8 animate-in fade-in duration-500 min-h-[calc(100vh-80px)]">

      <LocationCard loc={loc} />

      {user?.username ? (
        /* ── Personalised greeting + leaf ring ────────────────────────── */
        <GreetingHeader
          username={user.username}
          leavesCount={user.leavesCount ?? 0}
          pendingGuide={pendingCareGuide}
          onLeafClick={() =>
            leaderboardRef.current?.scrollIntoView({ behavior: "smooth" })
          }
        />
      ) : (
        /* ── Static fallback for guests / no username yet ─────────────── */
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Leaf className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-serif text-foreground">Kräuterhexe</h1>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Scanne Pflanzen, Insekten und Pilze.
          </p>
        </div>
      )}

      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      {/* Error messages */}
      {errorMsg && !isLoading && !preview && (
        errorKind === "insect" ? (
          /* Insect-specific error — amber, with retry buttons */
          <div className="w-full max-w-sm space-y-3 animate-in slide-in-from-bottom-2">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 p-4 rounded-xl flex items-start gap-3">
              <Bug className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Kein Insekt erkannt
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  {errorMsg}
                </p>
              </div>
            </div>
            <Button
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => { setErrorMsg(null); openCamera("insect"); }}
            >
              <Camera className="w-4 h-4 mr-2" />
              Erneut fotografieren
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setErrorMsg(null)}
            >
              Zurück
            </Button>
          </div>
        ) : (
          <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex items-start gap-3 w-full max-w-sm animate-in slide-in-from-bottom-2">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{errorMsg}</p>
          </div>
        )
      )}

      {/* Loading spinners */}
      {isLoading ? (
        <div className="flex flex-col items-center gap-3 text-muted-foreground animate-in fade-in w-full max-w-sm">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm">
            {isPreparing
              ? "Foto wird vorbereitet…"
              : isInsectScanning
                ? "Insekt wird bestimmt…"
                : preparingMode === "insect"
                  ? "Insekt wird bestimmt…"
                  : "Pflanze wird analysiert…"}
          </p>
          {waitingForItemId && (
            <div className="w-full space-y-1.5">
              <Progress value={scanProgress} className="h-2.5" />
              <p className="text-xs text-center text-muted-foreground">
                {Math.round(scanProgress)} %
              </p>
            </div>
          )}
        </div>
      ) : preview ? (
        /* ── Preview card: confirm before the analysis fires ──────────── */
        <Card className="w-full max-w-sm overflow-hidden border-none shadow-xl animate-in fade-in zoom-in-95">
          <div className="relative aspect-[4/3] bg-black/5">
            <img
              src={preview.image}
              alt="Foto-Vorschau"
              className="object-cover w-full h-full"
            />
            {preview.mode === "insect" && (
              <div className="absolute top-3 left-3">
                <Badge className="bg-amber-600 text-white border-none">
                  🐛 Insekt
                </Badge>
              </div>
            )}
          </div>
          <CardContent className="p-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              Foto bereit – Analyse starten?
            </p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() =>
                  setPreview((p) => (p ? { ...p, phase: "counting" } : null))
                }
                disabled={preview.phase === "counting"}
                className={
                  preview.mode === "insect"
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : ""
                }
              >
                {preview.phase === "counting" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analysiere in {preview.countdown} s …
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 mr-2" />
                    Jetzt analysieren →
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  resetToStart();
                }}
                disabled={preview.phase === "counting"}
              >
                Neu aufnehmen
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : mushroomTop ? (
        /* Step 2: first photo taken, prompt for side view */
        <Card className="w-full max-w-sm overflow-hidden border-none shadow-xl animate-in fade-in zoom-in-95">
          <div className="relative aspect-[4/3] bg-black/5">
            <img
              src={mushroomTop}
              alt="Pilz von oben"
              className="object-cover w-full h-full"
            />
            <div className="absolute top-3 left-3 flex flex-col gap-1.5">
              <Badge className="bg-black/60 text-white border-none backdrop-blur-sm">
                Bild 1 von 2 · ✓ von oben
              </Badge>
              <Badge className="bg-amber-600 text-white border-none">
                Nächstes Bild von der Seite
              </Badge>
            </div>
          </div>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="font-serif text-2xl text-foreground">
                🍄 Jetzt von der Seite fotografieren
              </h2>
              <p className="text-sm text-muted-foreground">
                Fotografiere denselben Pilz jetzt <strong>von der Seite</strong>{" "}
                – mit Stiel, Lamellen und Stielansatz. Nur mit beiden Ansichten
                kann die Essbarkeit sicher geprüft werden.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => openCamera("mushroomSide")}>
                <Camera className="w-5 h-5 mr-2" />
                Foto von der Seite aufnehmen
              </Button>
              <Button
                variant="outline"
                onClick={() => openGallery("mushroomSide")}
              >
                <ImageIcon className="w-5 h-5 mr-2" />
                Aus Galerie wählen
              </Button>
              <Button variant="ghost" onClick={cancelMushroomScan}>
                Abbrechen
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : showPlantOptions ? (
        /* Plant source choice: camera or gallery */
        <Card className="w-full max-w-sm overflow-hidden border-none shadow-xl animate-in fade-in zoom-in-95">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <Leaf className="w-9 h-9 text-primary" />
            </div>
            <div className="space-y-1.5">
              <h2 className="font-serif text-2xl text-foreground">
                Pflanze scannen
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Fotografiere die Pflanze oder wähle ein Bild aus deiner Galerie.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => { setShowPlantOptions(false); openCamera(); }}>
                <Camera className="w-5 h-5 mr-2" />
                Kamera öffnen
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowPlantOptions(false); openGallery(); }}
              >
                <ImageIcon className="w-5 h-5 mr-2" />
                Aus Galerie wählen
              </Button>
              <Button variant="ghost" onClick={() => setShowPlantOptions(false)}>
                Abbrechen
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : showInsectOptions ? (
        /* Insect source choice: camera or gallery */
        <Card className="w-full max-w-sm overflow-hidden border-none shadow-xl animate-in fade-in zoom-in-95">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <Bug className="w-9 h-9 text-primary" />
            </div>
            <div className="space-y-1.5">
              <h2 className="font-serif text-2xl text-foreground">
                Insekt scannen
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Fotografiere das Insekt oder wähle ein Bild aus deiner Galerie.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => { setShowInsectOptions(false); openCamera("insect"); }}>
                <Camera className="w-5 h-5 mr-2" />
                Kamera öffnen
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowInsectOptions(false); openGallery("insect"); }}
              >
                <ImageIcon className="w-5 h-5 mr-2" />
                Aus Galerie wählen
              </Button>
              <Button variant="ghost" onClick={() => setShowInsectOptions(false)}>
                Abbrechen
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : showMushroomTopHint ? (
        /* Step 1 hint: shown after tapping "Pilz scannen", before camera opens */
        <Card className="w-full max-w-sm overflow-hidden border-none shadow-xl animate-in fade-in zoom-in-95">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <span className="text-4xl" aria-hidden="true">🍄</span>
              <Badge className="bg-amber-600 text-white border-none text-sm px-3 py-1">
                Schritt 1 von 2
              </Badge>
            </div>
            <div className="space-y-1.5">
              <h2 className="font-serif text-2xl text-foreground">
                Erstes Foto von oben
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Fotografiere den Pilz <strong>von oben</strong> – möglichst
                senkrecht auf den Hut. Im nächsten Schritt folgt dann ein Foto
                von der Seite.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => { setShowMushroomTopHint(false); openCamera("mushroomTop"); }}>
                <Camera className="w-5 h-5 mr-2" />
                Kamera öffnen
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowMushroomTopHint(false); openGallery("mushroomTop"); }}
              >
                <ImageIcon className="w-5 h-5 mr-2" />
                Aus Galerie wählen
              </Button>
              <Button variant="ghost" onClick={() => setShowMushroomTopHint(false)}>
                Abbrechen
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : !errorMsg ? (
        /* ── Three scan buttons ──────────────────────────────────────────── */
        <div className="flex flex-col gap-3 w-full max-w-sm">

          {/* Pflanze */}
          <Button
            size="lg"
            className="w-full h-14 rounded-2xl text-base shadow-md hover:shadow-lg transition-all"
            onClick={() => setShowPlantOptions(true)}
          >
            <Camera className="w-5 h-5 mr-2" />
            Pflanze
          </Button>

          {/* Pilz */}
          <Button
            variant="outline"
            size="lg"
            className="w-full h-14 rounded-2xl text-base border-amber-500/50 bg-amber-50/60 hover:bg-amber-100/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 text-foreground"
            onClick={() => setShowMushroomTopHint(true)}
          >
            <span className="mr-2 text-xl leading-none" aria-hidden="true">🍄</span>
            Pilz
          </Button>

          {/* Insekt */}
          <Button
            variant="outline"
            size="lg"
            className="w-full h-14 rounded-2xl text-base"
            onClick={() => setShowInsectOptions(true)}
          >
            <Bug className="w-5 h-5 mr-2" />
            Insekt
          </Button>

          {!isOnline && (
            <div className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground pt-1">
              <WifiOff className="w-3.5 h-3.5" />
              Offline – Fotos werden gespeichert und später gescannt.
            </div>
          )}

          {pendingCount > 0 && (
            <Link
              href="/warteschlange"
              className="flex items-center justify-center gap-1.5 text-center text-sm font-medium text-primary hover:underline"
            >
              <Clock className="w-4 h-4" />
              {pendingCount} Foto{pendingCount === 1 ? "" : "s"} warten auf den Scan
            </Link>
          )}
        </div>
      ) : null}

      {/* Leaderboard — shown below scan buttons once user has a username */}
      {!errorMsg && user?.username && (
        <div ref={leaderboardRef} className="w-full">
          <LeaderboardSection />
        </div>
      )}
    </div>
  );
}
