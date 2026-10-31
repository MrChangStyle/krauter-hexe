import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  Camera,
  Leaf,
  Loader2,
  AlertCircle,
  Bug,
  Clock,
  WifiOff,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MAX_AUTO_ATTEMPTS, useScanQueue, getIsOnline } from "@/lib/scan-queue-context";
import { Progress } from "@/components/ui/progress";
import { useScanInsect, useListCareGuides } from "@workspace/api-client-react";
import type { CareGuide } from "@workspace/api-client-react";
import { HofDashboard } from "@/components/hof-dashboard";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/lib/auth-context";
import {
  getMushroomDraft,
  putMushroomDraft,
  clearMushroomDraft,
} from "@/lib/scan-queue";
import { downscaleFile, downscaleScan } from "@/lib/image";
import { useLocationRegion } from "@/lib/use-location-region";
import { LocationCard } from "@/components/location-card";
import { FindSpotsConsentCard } from "@/components/find-spots";
import { putImage } from "@/lib/image-store";
import { recordScanPhoto } from "@/lib/my-photos";

// Which capture the hidden file input is currently serving: the universal
// scan ("auto": the server decides plant or insect), the normal single-photo
// plant scan, the insect scan, or one of the two steps of the Pilz-Scan
// (Bild 1: von oben, Bild 2: von der Seite, Bild 3: Lamellen von unten).
type CaptureMode = "auto" | "plant" | "insect" | "mushroomTop" | "mushroomSide" | "mushroomGills";

// Prepared scan waiting for the user to confirm (preview step).
type ScanPreview = {
  image: string;
  topImage: string | null;
  /** Pilz-Scan: Bild 2 (von der Seite); `image` is then Bild 3 (Lamellen). */
  sideImage: string | null;
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

// ── Dynamic greeting header ───────────────────────────────────────────────────

function GreetingHeader({ username, pendingGuide }: { username: string; pendingGuide: CareGuide | undefined }) {
  const contextLine = pendingGuide ? `Deine ${pendingGuide.plantName} braucht heute Pflege! 🌱` : "Hier siehst du, was auf deinem Hof los ist.";
  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold">Hallo {username} 👋</h1>
      <p className="text-sm text-muted-foreground mt-1">{contextLine}</p>
    </div>
  );
}

/** Shown when the AI fails for now and the queue will try the photo again. */
export const SCAN_RETRY_TEXT =
  "Die Erkennung klappt gerade nicht. Dein Foto ist gespeichert und wird automatisch noch einmal versucht – du findest es unter Mehr → Warteschlange.";

export default function ScanPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  // Bild 2 (von der Seite), once taken – the scan then waits for Bild 3.
  const [mushroomSide, setMushroomSide] = useState<string | null>(null);
  // True while the "Erstes Foto von oben" hint card is shown (before the
  // camera opens for step 1 of a Pilz-Scan).
  const [showMushroomTopHint, setShowMushroomTopHint] = useState(false);
  // True while the camera/gallery choice card is shown for plant or insect.
  const [showPlantOptions, setShowPlantOptions] = useState(false);
  const [showInsectOptions, setShowInsectOptions] = useState(false);
  const [showAutoOptions, setShowAutoOptions] = useState(false);
  // Whether the scan we are waiting for came from the universal button
  // (changes the spinner label: the subject is not known yet).
  const [waitingIsAuto, setWaitingIsAuto] = useState(false);
  const mushroomTopRef = useRef<string | null>(null);
  const mushroomSideRef = useRef<string | null>(null);
  useEffect(() => {
    mushroomTopRef.current = mushroomTop;
    mushroomSideRef.current = mushroomSide;
  }, [mushroomTop, mushroomSide]);

  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // The scan button in the bottom bar opens this page with ?scan=auto or
  // ?scan=pilz: show the matching start card, then drop the parameter so a
  // reload or "back" does not reopen it.
  const search = useSearch();
  useEffect(() => {
    const mode = new URLSearchParams(search).get("scan");
    if (!mode) return;
    setErrorMsg(null);
    setShowPlantOptions(false);
    setShowInsectOptions(false);
    if (mode === "pilz") {
      setShowAutoOptions(false);
      setShowMushroomTopHint(true);
    } else {
      setShowMushroomTopHint(false);
      setShowAutoOptions(true);
    }
    setLocation("/", { replace: true });
  }, [search, setLocation]);
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
    insectResults,
    clearInsectResults,
    notInsectResults,
    clearNotInsectResults,
    noSubjectResults,
    clearNoSubjectResults,
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
    // auto, plant or mushroomSide: enqueue then track progress.
    const isAuto = p.mode === "auto";
    void (async () => {
      let itemId: string;
      try {
        // Pilz-Scan: Bild 1 von oben, Bild 2 von der Seite, Bild 3 die Lamellen.
        itemId = p.topImage
          ? await enqueue(p.topImage, p.sideImage ?? p.image, p.localImageId, p.locationRegion, "plant", p.sideImage ? p.image : undefined)
          : await enqueue(
              p.image,
              undefined,
              p.localImageId,
              p.locationRegion,
              isAuto ? "auto" : "plant",
            );
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
        setMushroomSide(null);
        void clearMushroomDraft().catch(() => {});
      }
      // Use the live navigator.onLine check (not the potentially stale React
      // isOnline state) so we don't start the loading spinner when offline.
      if (getIsOnline()) {
        // IMPORTANT: setWaitingForItemId BEFORE processQueue so that if the
        // server responds synchronously-fast (e.g. 422), the notPlantResults
        // effect already has a waitingForItemId to match against and won't
        // silently accumulate stale results that match the next scan.
        setWaitingIsAuto(isAuto);
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
      onSuccess(data, variables) {
        void recordScanPhoto({
          kind: "insect",
          id: data.insect.id,
          newLocalId: variables.data.localImageId,
          fallbackOldId: data.insect.localImageId,
        });
        if (data.imageImproved) {
          toast({
            title: "📸 Dein Foto ist jetzt das Galerie-Bild",
            description: "Es war deutlich besser als das bisherige und wird jetzt allen gezeigt.",
          });
        }
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
        if (apiErr?.status === 429 && apiErr?.data?.error === "SCAN_BUDGET_REACHED") {
          toast({
            title: "Heute keine Scans mehr",
            description: `Die App hat ihr gemeinsames Tageskontingent aufgebraucht. Ab ${formatBerlinTime(apiErr?.data?.resetsAt ?? null)} geht es weiter.`,
            variant: "destructive",
          });
          return;
        }
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

  // Universal scan: the server recognised an insect.
  useEffect(() => {
    if (!waitingForItemId) return;
    const match = insectResults.find((r) => r.itemId === waitingForItemId);
    if (!match) return;
    clearInsectResults();
    setWaitingForItemId(null);
    setScanProgress(100);
    toast(
      match.alreadyInArchive
        ? {
            title: "Insekt bereits bekannt",
            description: `${match.insect.germanName} ist bereits in deinem Archiv.`,
          }
        : {
            title: "Neues Insekt entdeckt! 🌿",
            description: `+1 Blatt für ${match.insect.germanName}.`,
          },
    );
    setLocation(`/insekt/${match.insect.id}`);
  }, [insectResults, waitingForItemId, clearInsectResults, setLocation, toast]);

  // Universal scan: recognised as insect, but the insect identification found
  // none after all.
  useEffect(() => {
    if (!waitingForItemId) return;
    const match = notInsectResults.find((r) => r.itemId === waitingForItemId);
    if (!match) return;
    clearNotInsectResults();
    setWaitingForItemId(null);
    setScanProgress(0);
    setIsPreparing(false);
    setErrorKind("plant");
    setErrorMsg(
      "Das Motiv konnte nicht sicher bestimmt werden. Bitte fotografiere es noch einmal näher und schärfer.",
    );
  }, [notInsectResults, waitingForItemId, clearNotInsectResults]);

  // Universal scan: nothing scannable on the photo, or an animal.
  useEffect(() => {
    if (!waitingForItemId) return;
    const match = noSubjectResults.find((r) => r.itemId === waitingForItemId);
    if (!match) return;
    clearNoSubjectResults();
    setWaitingForItemId(null);
    setScanProgress(0);
    setIsPreparing(false);
    setErrorKind("plant");
    setErrorMsg(match.message);
  }, [noSubjectResults, waitingForItemId, clearNoSubjectResults]);

  // The scan we're waiting for failed (docs/scannen.md). The photo stays in
  // the queue (Mehr → Warteschlange) either way, so the spinner stops at once
  // and the user learns what happens next: retried automatically while the
  // AI is merely unreachable, or the server's reason when it will not work.
  // Waiting silently meant minutes of "95 %", because the retries back off.
  useEffect(() => {
    if (!waitingForItemId) return;
    const item = pending.find((p) => p.id === waitingForItemId);
    if (!item || item.status !== "error") return;
    const willAutoRetry =
      item.autoRetry === true && item.attempts < MAX_AUTO_ATTEMPTS;
    setWaitingForItemId(null);
    setScanProgress(0);
    setIsPreparing(false);
    if (willAutoRetry) {
      setErrorMsg(null);
      toast({ title: "Noch kein Ergebnis", description: SCAN_RETRY_TEXT });
    } else {
      setErrorKind("plant");
      setErrorMsg(item.error ?? "Der Scan ist fehlgeschlagen. Unter Mehr → Warteschlange kannst du ihn erneut starten.");
    }
  }, [pending, waitingForItemId, toast]);

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
        if (draft) {
          setMushroomTop(draft.image);
          setMushroomSide(draft.side ?? null);
        }
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
          : mode === "auto"
            // Universal scan: may be a small insect, so keep the resolution
            // of the insect page (detail decides the species).
            ? await downscaleFile(file, 1600, 0.8)
            : await downscaleScan(file);            // plant/mushroom: 900 px WebP scan
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
          sideImage: null,
          localImageId,
          mode: "insect",
          phase: "idle",
          countdown: 0,
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

      if (mode === "mushroomSide") {
        const top = mushroomTopRef.current;
        if (!top) {
          captureModeRef.current = "plant";
          setIsPreparing(false);
          setErrorKind("plant");
          setErrorMsg("Das erste Pilz-Foto fehlt. Bitte starte den Pilz-Scan neu.");
          return;
        }
        try {
          await putMushroomDraft(top, image);
        } catch {
          // Draft not persistable (e.g. private mode): continue in memory.
        }
        if (isStale()) return;
        setIsPreparing(false);
        setMushroomSide(image);
        return;
      }

      const topImage = mode === "mushroomGills" ? mushroomTopRef.current : null;
      const sideImage = mode === "mushroomGills" ? mushroomSideRef.current : null;
      if (mode === "mushroomGills" && (!topImage || !sideImage)) {
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
        if (sideImage) await putImage(`${id}-side`, sideImage);
        localImageId = id;
      } catch { /* local write failed – server falls back to imageData */ }

      const locationRegion = (await loc.askForLocation()) ?? undefined;
      if (isStale()) return;

      setIsPreparing(false);
      setPreview({
        image,
        topImage: topImage ?? null,
        sideImage: sideImage ?? null,
        localImageId,
        mode,
        phase: "idle",
        countdown: 0,
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
    setMushroomSide(null);
    setShowMushroomTopHint(false);
    void clearMushroomDraft().catch(() => {});
  };

  const isLoading = isPreparing || !!waitingForItemId || isInsectScanning;

  return (
    <div className="flex flex-col h-full items-center justify-start pt-6 px-4 pb-6 gap-5 animate-in fade-in duration-500 min-h-[calc(100vh-80px)]">

      <LocationCard loc={loc} />
      <FindSpotsConsentCard />

      {user?.username ? (
        /* ── Personalised greeting + leaf ring ────────────────────────── */
        <GreetingHeader username={user.username} pendingGuide={pendingCareGuide} />
      ) : (
        /* ── Static fallback for guests / no username yet ─────────────── */
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Leaf className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-serif text-foreground">Scannen</h1>
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
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 p-4 rounded-2xl flex items-start gap-3">
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
                : waitingForItemId && waitingIsAuto
                  ? "Wird erkannt und bestimmt…"
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
      ) : mushroomTop && mushroomSide ? (
        /* Step 3: top and side taken, prompt for the gills from below */
        <Card className="w-full max-w-sm overflow-hidden border-none shadow-xl animate-in fade-in zoom-in-95" data-testid="mushroom-step-3">
          <div className="relative grid aspect-[4/3] grid-cols-2 gap-0.5 bg-black/5">
            <img src={mushroomTop} alt="Pilz von oben" className="h-full w-full object-cover" />
            <img src={mushroomSide} alt="Pilz von der Seite" className="h-full w-full object-cover" />
            <div className="absolute top-3 left-3 flex flex-col gap-1.5">
              <Badge className="bg-black/60 text-white border-none backdrop-blur-sm">
                Bild 2 von 3 · ✓ oben · ✓ Seite
              </Badge>
              <Badge className="bg-amber-600 text-white border-none">
                Nächstes Bild: Lamellen von unten
              </Badge>
            </div>
          </div>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="font-serif text-2xl text-foreground">
                🍄 Jetzt die Lamellen von unten
              </h2>
              <p className="text-sm text-muted-foreground">
                Dreh den Pilz um oder fotografiere schräg von unten: <strong>Lamellen bzw. Röhren</strong>, ihre Farbe und wie sie am Stiel ansetzen. Erst mit allen
                drei Ansichten prüft die App, ob der Pilz essbar ist.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => openCamera("mushroomGills")}>
                <Camera className="w-5 h-5 mr-2" />
                Lamellen fotografieren
              </Button>
              <Button variant="outline" onClick={() => openGallery("mushroomGills")}>
                <ImageIcon className="w-5 h-5 mr-2" />
                Aus Galerie wählen
              </Button>
              <Button variant="ghost" onClick={cancelMushroomScan}>
                Abbrechen
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
                Bild 1 von 3 · ✓ von oben
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
                – mit Stiel, Ring und Stielbasis. Danach kommen die Lamellen von
                unten; erst mit allen drei Ansichten prüft die App die Essbarkeit.
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
      ) : showAutoOptions ? (
        /* Universal scan source choice: camera or gallery */
        <Card className="w-full max-w-sm overflow-hidden border-none shadow-xl animate-in fade-in zoom-in-95">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-2 text-3xl" aria-hidden="true">
              🌿🍄🐞
            </div>
            <div className="space-y-1.5">
              <h2 className="font-serif text-2xl text-foreground">
                Scannen
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Fotografiere eine Pflanze, einen Pilz oder ein Insekt – die App
                erkennt selbst, was es ist. Geh möglichst nah heran, das Motiv
                sollte scharf sein und das Bild gut füllen.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => { setShowAutoOptions(false); openCamera("auto"); }}>
                <Camera className="w-5 h-5 mr-2" />
                Kamera öffnen
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowAutoOptions(false); openGallery("auto"); }}
              >
                <ImageIcon className="w-5 h-5 mr-2" />
                Aus Galerie wählen
              </Button>
              <Button variant="ghost" onClick={() => setShowAutoOptions(false)}>
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
                Schritt 1 von 3
              </Badge>
            </div>
            <div className="space-y-1.5">
              <h2 className="font-serif text-2xl text-foreground">
                Erstes Foto von oben
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Fotografiere den Pilz <strong>von oben</strong> – möglichst
                senkrecht auf den Hut. Danach folgen ein Foto von der Seite und
                eins von den Lamellen unten.
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
        /* ── Hof overview: weather, Pflanzenretter, widgets (scans start from the bottom bar) ── */
        <div className="flex flex-col gap-3 w-full">
          <HofDashboard />

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

    </div>
  );
}
