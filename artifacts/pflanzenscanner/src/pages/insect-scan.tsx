/**
 * /insekten-scanner — tabs: Scan | Archiv | Arten
 * The standalone insect-scan tool merged with the former /insekten page.
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Bug,
  Camera,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  BookOpen,
  Layers,
  ShieldAlert,
  Leaf,
  Minus,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScanInsect, useListInsects, type Insect } from "@workspace/api-client-react";
import { downscaleFile } from "@/lib/image";
import { putImage } from "@/lib/image-store";
import { useToast } from "@/hooks/use-toast";
import { InsectCard, INSECT_CATEGORY_LABELS } from "@/components/insect-card";
import { PeckingChicken } from "@/components/pecking-chicken";
import { cn } from "@/lib/utils";
import { useLocationRegion } from "@/lib/use-location-region";
import { LocationCard } from "@/components/location-card";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "scan" | "archiv" | "arten";
type InsectCategory = Insect["category"];

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ─── Alpha helpers ────────────────────────────────────────────────────────────

function firstLetterI(insect: Insect): string {
  return insect.germanName.charAt(0).toLocaleUpperCase("de");
}

function availableLettersI(insects: Insect[]): string[] {
  const set = new Set(insects.map(firstLetterI));
  return [...set].sort((a, b) => a.localeCompare(b, "de"));
}

function applyAlphaI(insects: Insect[], letter: string | null): Insect[] {
  const list = letter ? insects.filter((i) => firstLetterI(i) === letter) : insects;
  if (!letter) return list;
  return [...list].sort((a, b) => a.germanName.localeCompare(b.germanName, "de"));
}

// ─── Alpha filter ─────────────────────────────────────────────────────────────

function InsectAlphaFilter({
  insects,
  activeLetter,
  onChange,
}: {
  insects: Insect[];
  activeLetter: string | null;
  onChange: (l: string | null) => void;
}) {
  const letters = availableLettersI(insects);
  if (letters.length <= 1) return null;
  return (
    <div className="-mx-6 px-6 overflow-x-auto mb-1">
      <div className="flex gap-1.5 min-w-max pb-1">
        <button
          onClick={() => onChange(null)}
          className={`min-w-[2.25rem] h-8 px-2.5 rounded-lg text-sm font-semibold border transition-colors ${
            activeLetter === null
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
          }`}
        >
          Alle
        </button>
        {letters.map((l) => (
          <button
            key={l}
            onClick={() => onChange(activeLetter === l ? null : l)}
            className={`min-w-[2.25rem] h-8 px-2 rounded-lg text-sm font-semibold border transition-colors ${
              activeLetter === l
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Archiv tab ───────────────────────────────────────────────────────────────

function ArchivTab({ insects }: { insects: Insect[] }) {
  const [letter, setLetter] = useState<string | null>(null);
  const displayed = applyAlphaI(insects, letter);

  if (insects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-10 gap-3">
        <Bug className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Noch keine Insekten gescannt.</p>
        <p className="text-xs text-muted-foreground">
          Nutze den Scan-Tab, um dein erstes Insekt zu bestimmen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <InsectAlphaFilter insects={insects} activeLetter={letter} onChange={setLetter} />
      <p className="text-xs text-muted-foreground">
        {displayed.length === insects.length
          ? `${insects.length} Insekt${insects.length === 1 ? "" : "en"} im Archiv`
          : `${displayed.length} von ${insects.length} · Buchstabe ${letter}`}
      </p>
      <div className="space-y-3">
        {displayed.map((insect) => (
          <InsectCard key={insect.id} insect={insect} />
        ))}
      </div>
    </div>
  );
}

// ─── Arten tab ────────────────────────────────────────────────────────────────

const CATEGORY_ORDER: InsectCategory[] = [
  "beetle",
  "butterfly",
  "bee_wasp",
  "fly_mosquito",
  "bug_cicada",
  "grasshopper",
  "dragonfly",
  "spider_other",
];

const CATEGORY_COLORS: Record<InsectCategory, string> = {
  beetle:       "bg-amber-100   text-amber-800   border-amber-200   dark:bg-amber-950/50   dark:text-amber-300",
  butterfly:    "bg-violet-100  text-violet-800  border-violet-200  dark:bg-violet-950/50  dark:text-violet-300",
  bee_wasp:     "bg-yellow-100  text-yellow-800  border-yellow-200  dark:bg-yellow-950/50  dark:text-yellow-300",
  fly_mosquito: "bg-slate-100   text-slate-700   border-slate-200   dark:bg-slate-800/50   dark:text-slate-300",
  bug_cicada:   "bg-lime-100    text-lime-800    border-lime-200    dark:bg-lime-950/50    dark:text-lime-300",
  grasshopper:  "bg-green-100   text-green-800   border-green-200   dark:bg-green-950/50   dark:text-green-300",
  dragonfly:    "bg-cyan-100    text-cyan-800    border-cyan-200    dark:bg-cyan-950/50    dark:text-cyan-300",
  spider_other: "bg-rose-100    text-rose-800    border-rose-200    dark:bg-rose-950/50    dark:text-rose-300",
};

const RELATION_COUNTS_LABEL = (pests: number, beneficial: number): string => {
  const parts: string[] = [];
  if (pests > 0) parts.push(`${pests} Schädling${pests === 1 ? "" : "e"}`);
  if (beneficial > 0) parts.push(`${beneficial} Nützling${beneficial === 1 ? "" : "e"}`);
  return parts.join(" · ") || "Keine Einträge";
};

function ArtenTab({ insects }: { insects: Insect[] }) {
  const [selectedCategory, setSelectedCategory] = useState<InsectCategory | null>(null);
  const [letter, setLetter] = useState<string | null>(null);

  if (selectedCategory !== null) {
    const inCategory = insects.filter((i) => i.category === selectedCategory);
    const displayed = applyAlphaI(inCategory, letter);

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setSelectedCategory(null); setLetter(null); }}
            className="flex items-center justify-center w-9 h-9 rounded-full border hover:bg-muted transition-colors shrink-0"
            aria-label="Zurück zur Übersicht"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-semibold text-lg">{INSECT_CATEGORY_LABELS[selectedCategory]}</h2>
            <p className="text-xs text-muted-foreground">
              {inCategory.length} Eintrag{inCategory.length === 1 ? "" : "einträge"}
            </p>
          </div>
        </div>

        {inCategory.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-10 gap-3 bg-muted/30 rounded-3xl border border-dashed">
            <Bug className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Noch keine {INSECT_CATEGORY_LABELS[selectedCategory]} gescannt.
            </p>
          </div>
        ) : (
          <>
            <InsectAlphaFilter insects={inCategory} activeLetter={letter} onChange={setLetter} />
            <p className="text-xs text-muted-foreground">
              {displayed.length === inCategory.length
                ? `${inCategory.length} Eintrag${inCategory.length === 1 ? "" : "einträge"}`
                : `${displayed.length} von ${inCategory.length} · Buchstabe ${letter}`}
            </p>
            <div className="space-y-3">
              {displayed.map((insect) => (
                <InsectCard key={insect.id} insect={insect} />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Wähle eine Gruppe, um alle gescannten Vertreter zu sehen.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {CATEGORY_ORDER.map((cat) => {
          const inCat = insects.filter((i) => i.category === cat);
          const pests = inCat.filter((i) => i.relationStatus === "pest").length;
          const beneficial = inCat.filter((i) => i.relationStatus === "beneficial").length;
          const color = CATEGORY_COLORS[cat];

          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "flex flex-col items-start text-left gap-2 p-4 rounded-2xl border transition-all active:scale-[0.97] hover:shadow-md",
                inCat.length > 0
                  ? color + " hover:brightness-95 cursor-pointer"
                  : "bg-muted/40 text-muted-foreground border-border cursor-default opacity-60",
              )}
              disabled={inCat.length === 0}
            >
              <span className="font-semibold text-sm leading-tight">
                {INSECT_CATEGORY_LABELS[cat]}
              </span>
              <span className="text-xs leading-snug opacity-80">
                {inCat.length === 0
                  ? "Keine Einträge"
                  : RELATION_COUNTS_LABEL(pests, beneficial)}
              </span>
              {inCat.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-auto">
                  {pests > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-rose-200/60 text-rose-800 rounded px-1.5 py-0.5">
                      <ShieldAlert className="w-2.5 h-2.5" />
                      {pests}
                    </span>
                  )}
                  {beneficial > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-emerald-200/60 text-emerald-800 rounded px-1.5 py-0.5">
                      <Leaf className="w-2.5 h-2.5" />
                      {beneficial}
                    </span>
                  )}
                  {inCat.filter((i) => i.relationStatus === "neutral").length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-gray-200/60 text-gray-700 rounded px-1.5 py-0.5">
                      <Minus className="w-2.5 h-2.5" />
                      {inCat.filter((i) => i.relationStatus === "neutral").length}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Scan tab ─────────────────────────────────────────────────────────────────

type ScanPreview = {
  image: string;
  localImageId: string | undefined;
  phase: "idle" | "counting";
  countdown: number;
  locationRegion: string | undefined;
};

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

function ScanTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScanPreview | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loc = useLocationRegion();

  // Ref holds the latest execute function so the countdown useEffect always
  // calls the freshest closure without being in its dependency array.
  const executeAnalysisRef = useRef<((p: ScanPreview) => void) | null>(null);

  const { mutate: scanInsect, isPending: isScanning } = useScanInsect({
    mutation: {
      onSuccess(data) {
        // Seed the list cache so the detail page can find the insect immediately
        // without waiting for a refetch (avoids "Insekt nicht gefunden" flash).
        queryClient.setQueryData<Insect[]>(["/api/insects"], (old) => {
          if (!old) return [data.insect];
          if (old.some((i) => i.id === data.insect.id)) return old;
          return [data.insect, ...old];
        });
        // Also invalidate so the list refreshes in the background.
        void queryClient.invalidateQueries({ queryKey: ["/api/insects"] });
        if (data.alreadyInArchive) {
          toast({
            title: "Insekt bereits bekannt",
            description: `${data.insect.germanName} war bereits im Archiv.`,
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
          setErrorMsg(
            "Das Foto zeigt kein Insekt. Bitte fotografiere ein Insekt, eine Spinne oder ein anderes Gliedertier.",
          );
        } else {
          setErrorMsg(
            apiErr?.data?.error ??
              "Die Identifizierung hat leider nicht geklappt. Bitte versuche es erneut.",
          );
        }
      },
    },
  });

  // Keep executeAnalysisRef.current in sync with the latest scanInsect closure.
  executeAnalysisRef.current = (p: ScanPreview): void => {
    scanInsect({
      data: {
        image: p.image,
        ...(p.localImageId ? { localImageId: p.localImageId } : {}),
        ...(p.locationRegion ? { locationRegion: p.locationRegion } : {}),
      },
    });
  };

  const isLoading = isPreparing || isScanning;

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

  async function handleFile(file: File) {
    setErrorMsg(null);
    setIsPreparing(true);
    let imageData: string;
    try {
      // Insects are often small in the frame – more resolution helps the AI.
      imageData = await downscaleFile(file, 1600, 0.82);
    } finally {
      setIsPreparing(false);
    }
    // Only pass localImageId when the local write succeeds. If putImage throws
    // (quota, private browsing, etc.) the server stores imageData as fallback.
    let localImageId: string | undefined;
    try {
      const id = crypto.randomUUID();
      await putImage(id, imageData);
      localImageId = id;
    } catch { /* local write failed – server falls back to imageData */ }
    const locationRegion = (await loc.askForLocation()) ?? undefined;
    setPreview({
      image: imageData,
      localImageId,
      phase: "idle",
      countdown: 5,
      locationRegion,
    });
  }

  function openCamera() {
    if (fileInputRef.current) {
      fileInputRef.current.accept = "image/*";
      fileInputRef.current.setAttribute("capture", "environment");
      fileInputRef.current.click();
    }
  }

  function openGallery() {
    if (fileInputRef.current) {
      fileInputRef.current.accept = "image/*";
      fileInputRef.current.removeAttribute("capture");
      fileInputRef.current.click();
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void handleFile(file);
  }

  return (
    <div className="space-y-6">
      <LocationCard loc={loc} />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={onFileChange}
        aria-hidden
      />

      {isLoading && (
        <div className="flex flex-col items-center justify-center gap-4 py-14 text-center">
          <div className="relative">
            <Bug className="w-16 h-16 text-amber-400/30" />
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin absolute top-4 left-4" />
          </div>
          <div>
            <p className="font-medium">
              {isPreparing ? "Foto wird vorbereitet …" : "Insekt wird bestimmt …"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Das dauert meist 5–15 Sekunden.
            </p>
          </div>
        </div>
      )}

      {!isLoading && !preview && errorMsg && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Kein Insekt erkannt</p>
            <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
          </div>
        </div>
      )}

      {!isLoading && (
        preview ? (
          /* ── Preview card: confirm before the analysis fires ── */
          <div className="rounded-2xl border bg-card shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="relative aspect-[4/3] bg-black/5">
              <img
                src={preview.image}
                alt="Foto-Vorschau"
                className="object-cover w-full h-full"
              />
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Foto bereit – Analyse starten?
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() =>
                    setPreview((p) => (p ? { ...p, phase: "counting" } : null))
                  }
                  disabled={preview.phase === "counting"}
                >
                  {preview.phase === "counting" ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analysiere in {preview.countdown} s …
                    </>
                  ) : (
                    <>
                      <Camera className="w-5 h-5 mr-2" />
                      Jetzt analysieren →
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setPreview(null)}
                  disabled={preview.phase === "counting"}
                >
                  Neu aufnehmen
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            <Button
              className="w-full h-14 text-base gap-3 bg-amber-600 hover:bg-amber-700"
              onClick={openCamera}
            >
              <Camera className="w-5 h-5" />
              Insekt fotografieren
            </Button>
            <Button variant="outline" className="w-full h-12 gap-3" onClick={openGallery}>
              <ImageIcon className="w-5 h-5" />
              Aus Galerie wählen
            </Button>
          </div>
        )
      )}

      {!isLoading && !preview && (
        <div className="rounded-xl bg-muted/60 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Tipps für bessere Ergebnisse
          </p>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
            <li>Möglichst nah heranzoomen</li>
            <li>Insekt möglichst still und in Ruhe fotografieren</li>
            <li>Gute Beleuchtung, kein Gegenlicht</li>
            <li>Spinnen und andere Gliedertiere werden ebenfalls erkannt</li>
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function InsectScanPage() {
  const [activeTab, setActiveTab] = useState<Tab>("scan");

  const { data: insects = [], isLoading, isError } = useListInsects({
    query: { queryKey: ["/api/insects"] },
  });

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-start gap-3">
        <div className="mt-0.5 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shrink-0">
          <Bug className="w-6 h-6" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-xl font-bold">Insekten Scanner</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Käfer, Schmetterlinge, Bienen, Spinnen u. v. m. – Schädling oder Nützling?
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4">
        <div className="flex gap-0 max-w-2xl mx-auto">
          <TabButton
            active={activeTab === "scan"}
            onClick={() => setActiveTab("scan")}
            icon={Camera}
            label="Scan"
          />
          <TabButton
            active={activeTab === "archiv"}
            onClick={() => setActiveTab("archiv")}
            icon={BookOpen}
            label="Archiv"
          />
          <TabButton
            active={activeTab === "arten"}
            onClick={() => setActiveTab("arten")}
            icon={Layers}
            label="Arten"
          />
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-5 pb-6 flex-1">
        {activeTab === "scan" && <ScanTab />}

        {(activeTab === "archiv" || activeTab === "arten") && (
          <>
            {isLoading && (
              <div className="flex items-center justify-center py-14">
                <PeckingChicken size={100} label="Insekten werden geladen …" className="text-primary" />
              </div>
            )}
            {isError && (
              <p className="text-sm text-destructive text-center py-8">
                Insekten konnten nicht geladen werden.
              </p>
            )}
            {!isLoading && !isError && activeTab === "archiv" && (
              <ArchivTab insects={insects} />
            )}
            {!isLoading && !isError && activeTab === "arten" && (
              <ArtenTab insects={insects} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
