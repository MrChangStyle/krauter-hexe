import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listUsers,
  updateUserApproval,
  deleteUser,
  useListMyScans,
  useListMyInsects,
  useGetLeaderboard,
  type ManagedUser,
} from "@workspace/api-client-react";
import { exportInsectsPdf, exportSelectedPlantsPdf } from "@/lib/pdf-export";
import { viewCategoryOf, VIEW_CATEGORY_LABELS } from "@/lib/view-categories";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import {
  Crown, ShieldCheck, Hourglass, Trash2, UserCheck, UserX,
  Pin, Camera, Users, WifiOff, Wifi, Loader2, Clock, AlertCircle,
  RefreshCw, ImageOff, TriangleAlert, Bug, Download, BookHeart, ChevronRight,
  ChevronDown, Leaf, Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PeckingChicken } from "@/components/pecking-chicken";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/lib/auth-context";
import { PushNotificationCard } from "@/components/push-notification-card";
import { useFavorites } from "@/lib/use-favorites";
import {
  useListPlants,
  useListCareGuides,
  useDeleteCareGuide,
  getListCareGuidesQueryKey,
} from "@workspace/api-client-react";
import type { CareGuide } from "@workspace/api-client-react";
import { differenceInDays } from "date-fns";
import { PlantCard } from "@/components/plant-card";
import { InsectCard } from "@/components/insect-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useScanQueue } from "@/lib/scan-queue-context";
import { STALE_QUEUE_WARNING_MS, type PendingScan } from "@/lib/scan-queue";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { useImageBackup } from "@/lib/use-image-backup";

// ── Helpers ──────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  return (
    (err as { data?: { error?: string } } | null)?.data?.error ??
    "Das hat leider nicht geklappt. Bitte versuche es erneut."
  );
}

function displayName(user: ManagedUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email ||
    "Unbenanntes Konto"
  );
}

// ── Offline queue helpers (lifted from pending page) ─────────────────────────

function StatusBadge({ status }: { status: PendingScan["status"] }) {
  if (status === "scanning") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Wird gescannt
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="w-3 h-3" />
        Fehlgeschlagen
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Clock className="w-3 h-3" />
      Wartet
    </Badge>
  );
}

function StaleBadge({ createdAt, now }: { createdAt: number; now: number }) {
  if (now - createdAt < STALE_QUEUE_WARNING_MS) return null;
  return (
    <Badge
      variant="outline"
      className="gap-1 border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    >
      <TriangleAlert className="w-3 h-3" />
      Wartet seit {formatDistanceToNow(createdAt, { locale: de })}
    </Badge>
  );
}

// ── Tab buttons ──────────────────────────────────────────────────────────────

type Tab = "meine-scans" | "mein-beet" | "meine-insekten" | "offline";

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
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ── Offline queue tab ────────────────────────────────────────────────────────

function OfflineTab() {
  const now = useNow();
  const {
    pending,
    scanningIds,
    isOnline,
    isProcessing,
    processQueue,
    remove,
    retry,
    refresh,
    results,
  } = useScanQueue();

  // Re-read from storage when the tab becomes visible.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasWaiting = pending.some((p) => p.status === "pending");

  return (
    <div className="space-y-4">
      {/* Online / offline status banner */}
      <div
        className={cn(
          "rounded-xl p-4 flex items-start gap-3 text-sm",
          isOnline
            ? "bg-primary/10 text-foreground"
            : "bg-amber-500/10 text-amber-900 dark:text-amber-200",
        )}
      >
        {isOnline ? (
          <Wifi className="w-5 h-5 shrink-0 mt-0.5 text-primary" />
        ) : (
          <WifiOff className="w-5 h-5 shrink-0 mt-0.5" />
        )}
        <p>
          {isOnline
            ? "Du bist online. Ausstehende Fotos werden automatisch gescannt."
            : "Der Empfang ist aktuell zu gering. Deine Fotos werden gespeichert und automatisch gescannt, sobald du wieder online bist."}
        </p>
      </div>

      {results.length > 0 && !isProcessing && (
        <Button asChild className="w-full">
          <Link href="/">Ergebnisse ansehen ({results.length})</Link>
        </Button>
      )}

      {pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-14 gap-4 text-muted-foreground">
          <ImageOff className="w-10 h-10" />
          <p>Keine ausstehenden Scans.</p>
          <Button asChild variant="outline">
            <Link href="/">Pflanze fotografieren</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {isOnline && hasWaiting && (
            <Button onClick={processQueue} disabled={isProcessing} className="w-full">
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Wird gescannt…
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Jetzt scannen
                </>
              )}
            </Button>
          )}

          {pending.map((item) => {
            const scanning = scanningIds.has(item.id);
            const status = scanning ? "scanning" : item.status;
            return (
              <Card key={item.id} className="p-3 flex items-center gap-3">
                <img
                  src={item.image}
                  alt="Ausstehendes Foto"
                  className="w-16 h-16 rounded-lg object-cover bg-muted shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge status={status} />
                    {item.imageSide && (
                      <Badge variant="secondary">🍄 2 Fotos</Badge>
                    )}
                    <StaleBadge createdAt={item.createdAt} now={now} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(item.createdAt, {
                      addSuffix: true,
                      locale: de,
                    })}
                  </p>
                  {status === "error" && item.error && (
                    <p className="text-xs text-destructive line-clamp-2">{item.error}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {status === "error" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => retry(item.id)}
                      title="Erneut versuchen"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove(item.id)}
                    disabled={scanning}
                    title="Entfernen"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── My Scans tab ─────────────────────────────────────────────────────────────

function MyScansTab({ favorites }: { favorites: ReturnType<typeof useFavorites> }) {
  const { data: plants, isLoading, isError } = useListMyScans({
    query: { queryKey: ["/api/plants/my-scans"] },
  });

  // Silently re-upload any locally-cached photos to the server so they are
  // visible on other devices via the GET /plants/:id/image fallback.
  useImageBackup(plants, "plant");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14">
        <PeckingChicken size={100} label="Meine Scans werden geladen …" className="text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive py-8 text-center">
        Meine Scans konnten nicht geladen werden.
      </p>
    );
  }

  if (!plants || plants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
        <Camera className="w-10 h-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Du hast noch keine Pflanzen gescannt.
        </p>
        <p className="text-xs text-muted-foreground">
          Neue Scans werden automatisch hier erscheinen.
        </p>
      </div>
    );
  }

  return (
    <CollapsibleCardList>
      {plants.map((plant) => (
        <PlantCard
          key={plant.id}
          plant={plant}
          variant="private"
          isFavorite={favorites.isFavorite(plant.id)}
          onToggleFavorite={favorites.toggle}
        />
      ))}
    </CollapsibleCardList>
  );
}

// ── Shared: Auf 3 Einträge begrenzte Liste mit Aufklapp-Button ───────────────

function CollapsibleCardList({ children }: { children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const items = React.Children.toArray(children);
  const visible = expanded ? items : items.slice(0, 3);
  const hidden = items.length - 3;

  return (
    <div className="space-y-3">
      {visible}
      {hidden > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Weniger anzeigen" : `${hidden} weitere anzeigen`}
        </button>
      )}
    </div>
  );
}

// ── Shared: PDF-Auswahl-Panel ─────────────────────────────────────────────────

const INSECT_CATEGORY_SHORT: Record<string, string> = {
  beetle:       "Käfer",
  butterfly:    "Schmetterling",
  bee_wasp:     "Biene/Wespe",
  fly_mosquito: "Fliege/Mücke",
  bug_cicada:   "Wanze/Zikade",
  grasshopper:  "Heuschrecke",
  dragonfly:    "Libelle",
  spider_other: "Spinne/Andere",
};

interface PdfItem {
  id: string;
  label: string;
  sublabel?: string;
}

function PdfSelectPanel({
  items,
  countLabel,
  onExport,
}: {
  items: PdfItem[];
  countLabel: string;
  /** Called with the subset the user selected. Should trigger a download. */
  onExport: (selected: PdfItem[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const exportingRef = useRef(false);
  const { toast } = useToast();

  const allChecked = items.length > 0 && selected.size === items.length;

  const openPanel = () => {
    // Pre-select everything when the panel first opens
    setSelected(new Set(items.map((i) => i.id)));
    setOpen(true);
  };

  const close = () => {
    if (isExporting) return;
    setOpen(false);
    setSelected(new Set());
  };

  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(items.map((i) => i.id)));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleExport = async () => {
    if (selected.size === 0 || exportingRef.current) return;
    const subset = items.filter((i) => selected.has(i.id));
    exportingRef.current = true;
    setIsExporting(true);
    try {
      await onExport(subset);
      toast({
        title: "PDF erstellt",
        description: `${subset.length} ${subset.length === 1 ? "Eintrag" : "Einträge"} exportiert.`,
      });
      close();
    } catch {
      toast({
        title: "Download fehlgeschlagen",
        description: "Bitte versuche es erneut.",
        variant: "destructive",
      });
    } finally {
      exportingRef.current = false;
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Toolbar row — always visible */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{countLabel}</p>
        {!open && (
          <button
            onClick={openPanel}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>
        )}
      </div>

      {/* Selection panel */}
      {open && (
        <div className="rounded-xl border bg-muted/30 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b bg-background/60">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-primary w-4 h-4"
                checked={allChecked}
                onChange={toggleAll}
              />
              <span className="text-xs font-semibold text-foreground">Alle auswählen</span>
            </label>
            <button
              onClick={close}
              disabled={isExporting}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1 disabled:opacity-40"
            >
              Abbrechen
            </button>
          </div>

          {/* Checklist */}
          <div className="divide-y divide-border max-h-56 overflow-y-auto">
            {items.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <input
                  type="checkbox"
                  className="accent-primary w-4 h-4 shrink-0"
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <span className="text-sm text-foreground leading-tight flex-1 min-w-0 truncate">
                  {item.label}
                </span>
                {item.sublabel && (
                  <span className="text-xs text-muted-foreground shrink-0">{item.sublabel}</span>
                )}
              </label>
            ))}
          </div>

          {/* Footer */}
          <div className="px-3 py-2.5 border-t bg-background/60">
            <button
              onClick={handleExport}
              disabled={selected.size === 0 || isExporting}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold py-2 px-4 disabled:opacity-50 transition-opacity active:scale-[0.98]"
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {isExporting
                ? "Erstelle PDF…"
                : selected.size > 0
                  ? `Herunterladen (${selected.size})`
                  : "Herunterladen"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Favourites tab ────────────────────────────────────────────────────────────

function MeinBeetTab({ favorites }: { favorites: ReturnType<typeof useFavorites> }) {
  const { data: allPlants, isLoading: plantsLoading } = useListPlants(undefined, {
    query: { queryKey: ["/api/plants"] },
  });

  const isLoading = favorites.isLoading || plantsLoading;

  const favoritePlants = (allPlants ?? []).filter((p) => favorites.isFavorite(p.id));

  // Backup favourite plants' local photos to the server.
  useImageBackup(favoritePlants, "plant");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14">
        <PeckingChicken size={100} label="Mein Beet wird geladen …" className="text-primary" />
      </div>
    );
  }

  if (favoritePlants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
        <Pin className="w-10 h-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Dein Beet ist noch leer.
        </p>
        <p className="text-xs text-muted-foreground">
          Tippe auf den Pin auf einer Pflanzen&shy;karte oder in der Detailansicht.
        </p>
      </div>
    );
  }

  const pdfItems: PdfItem[] = favoritePlants.map((p) => ({
    id: String(p.id),
    label: p.germanName,
    sublabel: VIEW_CATEGORY_LABELS[viewCategoryOf(p)],
  }));

  return (
    <div className="space-y-3">
      <PdfSelectPanel
        items={pdfItems}
        countLabel={`${favoritePlants.length} ${favoritePlants.length === 1 ? "Pflanze" : "Pflanzen"} im Beet`}
        onExport={async (selected) => {
          const ids = new Set(selected.map((i) => Number(i.id)));
          await exportSelectedPlantsPdf(favoritePlants.filter((p) => ids.has(p.id)));
        }}
      />
      <CollapsibleCardList>
        {favoritePlants.map((plant) => (
          <PlantCard
            key={plant.id}
            plant={plant}
            variant="private"
            isFavorite
            onToggleFavorite={favorites.toggle}
          />
        ))}
      </CollapsibleCardList>
    </div>
  );
}

// ── Meine Insekten tab ───────────────────────────────────────────────────────

function MeineInsektenTab() {
  const { data: insects, isLoading, isError } = useListMyInsects({
    query: { queryKey: ["/api/insects/my-scans"] },
  });

  // Silently re-upload locally-cached insect photos to the server.
  useImageBackup(insects, "insect");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14">
        <PeckingChicken size={100} label="Meine Insekten werden geladen …" className="text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive py-8 text-center">
        Meine Insekten konnten nicht geladen werden.
      </p>
    );
  }

  if (!insects || insects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
        <Bug className="w-10 h-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Du hast noch keine Insekten gescannt.
        </p>
        <p className="text-xs text-muted-foreground">
          Nutze den Insekten Scanner im Werkzeug-Bereich.
        </p>
      </div>
    );
  }

  const pdfItems: PdfItem[] = insects.map((ins) => ({
    id: String(ins.id),
    label: ins.germanName,
    sublabel: INSECT_CATEGORY_SHORT[ins.category] ?? ins.category,
  }));

  return (
    <div className="space-y-3">
      <PdfSelectPanel
        items={pdfItems}
        countLabel={`${insects.length} ${insects.length === 1 ? "Insekt" : "Insekten"} gescannt`}
        onExport={async (selected) => {
          const ids = new Set(selected.map((i) => Number(i.id)));
          await exportInsectsPdf(insects.filter((ins) => ids.has(ins.id)));
        }}
      />
      <CollapsibleCardList>
        {insects.map((insect) => (
          <InsectCard key={insect.id} insect={insect} variant="private" />
        ))}
      </CollapsibleCardList>
    </div>
  );
}

// ── Meine Pflege-Guides section ───────────────────────────────────────────────

function careGuideImageUrl(id: number): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}api/care-guides/${id}/image/day1`;
}

function GuideProgress({ guide }: { guide: CareGuide }) {
  const elapsed = Math.min(30, Math.max(1, differenceInDays(new Date(), new Date(guide.startDate)) + 1));
  const pct = Math.round((elapsed / 30) * 100);
  const isCompleted = guide.status === "Abgeschlossen";
  return (
    <div>
      <div className="flex justify-between items-center text-xs text-muted-foreground mb-1">
        {isCompleted
          ? <span className="text-emerald-600 font-medium">Abgeschlossen</span>
          : <span>Tag {elapsed} von 30</span>}
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isCompleted ? "bg-emerald-500" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PflegeGuidesSection() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: guides = [], isLoading } = useListCareGuides();
  const { mutate: deleteGuide, isPending: isDeleting } = useDeleteCareGuide({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListCareGuidesQueryKey() });
        setConfirmDeleteId(null);
      },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2">
          <BookHeart className="w-4 h-4 text-rose-500" />
          Meine Pflege-Guides
        </h2>
        {guides.length > 0 && (
          <button
            onClick={() => setLocation("/pflege-guides")}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Alle anzeigen <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : guides.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-8 text-center">
          <BookHeart className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground leading-snug">
            Noch keine Pflege-Guides erstellt.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Nutze den <button onClick={() => setLocation("/pflanzendoc")} className="underline hover:text-foreground transition-colors">Pflanzendoc</button>, um deinen ersten Guide zu erstellen.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {guides.slice(0, 3).map((guide) => (
            <div key={guide.id} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <button
                className="w-full text-left hover:bg-muted/40 transition-colors"
                onClick={() => setLocation(`/pflege-guide/${guide.id}`)}
              >
                <div className="flex items-stretch gap-0">
                  {/* Photo thumbnail */}
                  {guide.hasImageDay1 ? (
                    <div className="w-20 shrink-0 bg-muted overflow-hidden">
                      <img
                        src={careGuideImageUrl(guide.id)}
                        alt={guide.plantName}
                        className="w-full h-full object-cover"
                        style={{ minHeight: "80px" }}
                      />
                    </div>
                  ) : (
                    <div className="w-20 shrink-0 bg-muted/50 flex items-center justify-center" style={{ minHeight: "80px" }}>
                      <BookHeart className="w-6 h-6 text-muted-foreground/30" />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 px-3 py-3 min-w-0">
                    <p className="font-semibold text-sm leading-snug truncate mb-2">{guide.plantName}</p>
                    <GuideProgress guide={guide} />
                  </div>

                  <div className="flex items-center pr-3">
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </div>
              </button>

              <div className="border-t border-border px-3 py-1.5 flex justify-end">
                <button
                  onClick={() => setConfirmDeleteId(guide.id)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors py-0.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Löschen
                </button>
              </div>
            </div>
          ))}

          {guides.length > 3 && (
            <button
              onClick={() => setLocation("/pflege-guides")}
              className="w-full text-center text-xs text-muted-foreground hover:text-primary py-2 transition-colors"
            >
              + {guides.length - 3} weitere anzeigen
            </button>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={confirmDeleteId !== null} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pflege-Guide löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du diesen Pflege-Guide wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteId !== null && deleteGuide({ id: confirmDeleteId })}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Pflanzenretter rank card ──────────────────────────────────────────────────

function PflanzenretterCard() {
  const { user: me } = useAuthContext();
  const { data } = useGetLeaderboard();

  const own = data?.own;
  const leavesCount = own?.leavesCount ?? (me as { leavesCount?: number } | null)?.leavesCount ?? 0;
  const rank = own?.rank ?? null;

  return (
    <div className="rounded-2xl border bg-card shadow-sm px-4 py-4 flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
        <Leaf className="w-6 h-6 text-emerald-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-yellow-500" />
          Pflanzenretter
        </p>
        <p className="text-xs text-muted-foreground font-mono tracking-wide">{me?.username}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-lg font-bold text-emerald-600 flex items-center justify-end gap-1">
          <Leaf className="w-4 h-4" />
          {leavesCount}
        </p>
        {rank && (
          <p className="text-xs text-muted-foreground">
            Rang #{rank}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Owner: Benutzerverwaltung section ────────────────────────────────────────

function Benutzerverwaltung() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: me } = useAuthContext();

  const { data: users, isLoading, isError } = useQuery({
    queryKey: ["users"],
    queryFn: () => listUsers(),
    enabled: !!me?.isOwner,
  });

  const approval = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      updateUserApproval(id, { approved }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({
        title: updated.approved ? "Konto freigeschaltet" : "Freigabe entzogen",
        description: displayName(updated),
      });
    },
    onError: (err) =>
      toast({ title: "Fehler", description: errorMessage(err), variant: "destructive" }),
  });

  const removal = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Konto entfernt" });
    },
    onError: (err) =>
      toast({ title: "Fehler", description: errorMessage(err), variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <Users className="w-5 h-5 text-primary" />
        <h2 className="text-base font-semibold">Benutzerverwaltung</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Neue Konten erscheinen hier automatisch, sobald sich jemand zum ersten Mal
        anmeldet – freigeben musst du sie hier.
      </p>

      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <PeckingChicken size={80} label="Benutzer werden geladen …" className="text-primary" />
        </div>
      )}
      {isError && (
        <p className="text-sm text-destructive">
          Die Benutzerliste konnte nicht geladen werden.
        </p>
      )}

      {users?.map((u) => {
        const name = displayName(u);
        return (
          <div
            key={u.id}
            className="rounded-xl border border-border bg-card p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{name}</p>
                {u.email && (
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Dabei seit {format(new Date(u.createdAt), "dd.MM.yyyy")}
                </p>
              </div>
              {u.isOwner ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <Crown className="h-3 w-3" />
                  Besitzer
                </span>
              ) : u.approved ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <ShieldCheck className="h-3 w-3" />
                  Freigeschaltet
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <Hourglass className="h-3 w-3" />
                  Wartet
                </span>
              )}
            </div>

            {!u.isOwner && (
              <div className="flex gap-2">
                {u.approved ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={approval.isPending}
                    onClick={() => approval.mutate({ id: u.id, approved: false })}
                  >
                    <UserX className="h-3.5 w-3.5" />
                    Freigabe entziehen
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={approval.isPending}
                    onClick={() => approval.mutate({ id: u.id, approved: true })}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Freischalten
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      disabled={removal.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Entfernen
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Konto entfernen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {name} wird abgemeldet und aus der Liste entfernt. Bei einer
                        erneuten Anmeldung erscheint das Konto wieder als „wartend".
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={() => removal.mutate(u.id)}>
                        Entfernen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { user: me } = useAuthContext();
  const favorites = useFavorites();
  const [activeTab, setActiveTab] = useState<Tab>("meine-scans");

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold">Home</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Deine gescannten Pflanzen, dein Beet und Insekten auf einem Blick.
        </p>
      </div>

      {/* Pflanzenretter rank card */}
      {me?.username && <PflanzenretterCard />}

      {/* Tab switcher */}
      <div className="grid grid-cols-4 gap-1 bg-muted rounded-xl p-1">
        <TabButton
          active={activeTab === "meine-scans"}
          onClick={() => setActiveTab("meine-scans")}
          icon={Camera}
          label="Scans"
        />
        <TabButton
          active={activeTab === "mein-beet"}
          onClick={() => setActiveTab("mein-beet")}
          icon={Pin}
          label="Beet"
        />
        <TabButton
          active={activeTab === "meine-insekten"}
          onClick={() => setActiveTab("meine-insekten")}
          icon={Bug}
          label="Insekten"
        />
        <TabButton
          active={activeTab === "offline"}
          onClick={() => setActiveTab("offline")}
          icon={WifiOff}
          label="Offline"
        />
      </div>

      {/* Tab content */}
      {activeTab === "meine-scans" ? (
        <MyScansTab favorites={favorites} />
      ) : activeTab === "mein-beet" ? (
        <MeinBeetTab favorites={favorites} />
      ) : activeTab === "meine-insekten" ? (
        <MeineInsektenTab />
      ) : (
        <OfflineTab />
      )}

      {/* Pflege-Guides */}
      <div className="h-px bg-border" />
      <PflegeGuidesSection />

      {/* Push notifications */}
      <PushNotificationCard />

      {/* Owner-only: Benutzerverwaltung */}
      {me?.isOwner && (
        <>
          <div className="h-px bg-border mt-6" />
          <Benutzerverwaltung />
        </>
      )}
    </div>
  );
}
