import { useState, useRef, useEffect } from "react";
import { useListPlants, useDeletePlant } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams, useSearch } from "wouter";
import { ArrowLeft, Trash2, Leaf, ShieldAlert, CheckCircle2, ShieldCheck, HeartPulse, Info, MapPin, Mountain, Recycle, Sprout, Stethoscope, Share2, Check, ZoomIn, X, UtensilsCrossed, Loader2, Pin, ClipboardList, Camera } from "lucide-react";
import { useFavorites } from "@/lib/use-favorites";
import { plantImageUrl, plantSideImageUrl, plantCategoryPlaceholder, downscaleFile } from "@/lib/image";
import { useLocalImage } from "@/lib/use-local-image";
import { putImage } from "@/lib/image-store";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { PeckingChicken } from "@/components/pecking-chicken";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ANIMALS, animalLabel, getAnimalInfo, type AnimalKey } from "@/lib/animals";
import { HEAL_TARGETS, symptomsFor } from "@/lib/heal-targets";
import { humanBadge, animalBadge, animalCardClass } from "@/lib/plant-detail-helpers";
import { viewCategoryOf } from "@/lib/view-categories";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { exportPlantPdf } from "@/lib/pdf-export";

/** Parse and validate the `tier` query-param; fall back to "poultry". */
function parseTierParam(search: string): AnimalKey {
  const raw = new URLSearchParams(search).get("tier") ?? "";
  return (ANIMALS.find((a) => a.key === raw)?.key ?? "poultry") as AnimalKey;
}

export default function PlantDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const search = useSearch();

  // Read from the full plant list (the same query the archive uses, cached for
  // offline access) instead of a per-id endpoint, so the detail page works
  // fully offline for any plant already in the archive.
  // Archive reads are purely cache lookups — useListPlants pulls from the
  // React Query list cache seeded at list time; it never triggers an AI call.
  // Only POST /plants/scan invokes the AI.
  const { data: plants, isLoading, isError } = useListPlants(undefined, {
    query: { queryKey: ["/api/plants"] },
  });
  const plant = plants?.find((p) => p.id === id);

  // Local-first image resolution: new scans store photos in IndexedDB under
  // localImageId; legacy scans still use the server URL. Hooks are called
  // unconditionally (before any early return) with safe fallbacks.
  // Detail pages are always "private" – they try IndexedDB first and fall back
  // to the category placeholder when the image is absent (e.g. viewed on a
  // different device from where the scan was taken).
  const categoryPlaceholder = plant ? plantCategoryPlaceholder(plant.category) : `${import.meta.env.BASE_URL}placeholders/plant-edible.svg`;
  const { src: mainImageSrc, isPlaceholder: mainIsPlaceholder } = useLocalImage(
    plant?.localImageId ?? undefined,
    plant ? plantImageUrl(plant.id) : "",
    categoryPlaceholder,
    plant?.imageUrl,
  );
  const { src: sideImageSrc, isPlaceholder: sideIsPlaceholder } = useLocalImage(
    plant?.localImageId ? `${plant.localImageId}-side` : undefined,
    plant?.hasSideImage ? plantSideImageUrl(plant.id) : "",
    categoryPlaceholder,
    plant?.imageUrlSide,
  );

  const queryClient = useQueryClient();
  const deletePlant = useDeletePlant();
  const favorites = useFavorites();
  const { toast } = useToast();
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  // Initialise from the URL so shared links pre-select the correct animal.
  const [selectedAnimal, setSelectedAnimal] = useState<AnimalKey>(() =>
    parseTierParam(search)
  );
  const [shareState, setShareState] = useState<"idle" | "generating" | "done">("idle");
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // "Bild aktualisieren" — manual photo upload for entries that have no image.
  const imageUploadInputRef = useRef<HTMLInputElement>(null);
  const [imageUploadState, setImageUploadState] = useState<"idle" | "uploading">("idle");

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !plant) return;
    setImageUploadState("uploading");
    try {
      const dataUrl = await downscaleFile(file);
      // Store in IndexedDB for immediate local display.
      const localId = crypto.randomUUID();
      try { await putImage(localId, dataUrl); } catch { /* quota exceeded – ok */ }
      // Upload to GCS via the backup endpoint.
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/api/plants/${plant.id}/image/backup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: dataUrl }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Refresh the plant list so imageUrl is updated everywhere.
      await queryClient.invalidateQueries({ queryKey: ["/api/plants"] });
      toast({ title: "Bild gespeichert 🌿", description: "Das Foto wurde erfolgreich hinzugefügt." });
    } catch {
      toast({ title: "Upload fehlgeschlagen", description: "Bitte versuche es erneut.", variant: "destructive" });
    } finally {
      setImageUploadState("idle");
      if (imageUploadInputRef.current) imageUploadInputRef.current.value = "";
    }
  };

  // Pinch-to-zoom state for the lightbox
  const [lbScale, setLbScale] = useState(1);
  const [lbTx, setLbTx] = useState(0);
  const [lbTy, setLbTy] = useState(0);
  const lbRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const pinchDistRef = useRef<number | null>(null);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);

  // Reset zoom whenever the lightbox opens a new image
  useEffect(() => {
    lbRef.current = { scale: 1, tx: 0, ty: 0 };
    setLbScale(1);
    setLbTx(0);
    setLbTy(0);
  }, [zoomedImage]);

  function lbTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      pinchDistRef.current = Math.hypot(dx, dy);
      panStartRef.current = null;
    } else if (e.touches.length === 1) {
      panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      pinchDistRef.current = null;
    }
  }

  function lbTouchMove(e: React.TouchEvent) {
    e.stopPropagation();
    if (e.touches.length === 2 && pinchDistRef.current !== null) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const newDist = Math.hypot(dx, dy);
      const ratio = newDist / pinchDistRef.current;
      pinchDistRef.current = newDist;
      const next = Math.max(1, Math.min(6, lbRef.current.scale * ratio));
      lbRef.current.scale = next;
      setLbScale(next);
    } else if (e.touches.length === 1 && panStartRef.current && lbRef.current.scale > 1) {
      const nx = e.touches[0].clientX;
      const ny = e.touches[0].clientY;
      lbRef.current.tx += (nx - panStartRef.current.x) / lbRef.current.scale;
      lbRef.current.ty += (ny - panStartRef.current.y) / lbRef.current.scale;
      panStartRef.current = { x: nx, y: ny };
      setLbTx(lbRef.current.tx);
      setLbTy(lbRef.current.ty);
    }
  }

  function lbTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinchDistRef.current = null;
    if (e.touches.length === 1) {
      panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.touches.length === 0) {
      panStartRef.current = null;
      if (lbRef.current.scale < 1.05) {
        lbRef.current = { scale: 1, tx: 0, ty: 0 };
        setLbScale(1); setLbTx(0); setLbTy(0);
      }
    }
  }

  /** Change the selected animal and mirror the choice into the URL. */
  const handleAnimalChange = (key: AnimalKey) => {
    setSelectedAnimal(key);
    const sp = new URLSearchParams(window.location.search);
    sp.set("tier", key);
    // replaceState keeps the entry in history intact so the back-button works.
    window.history.replaceState(null, "", `${window.location.pathname}?${sp.toString()}`);
  };

  const handleShare = async () => {
    if (!plant || shareState === "generating") return;
    setShareState("generating");
    try {
      const blob = await exportPlantPdf(plant, window.location.origin);
      const filename = `Kraeuterhexe_${plant.germanName.replace(/\s+/g, "-")}.pdf`;
      const file = new File([blob], filename, { type: "application/pdf" });

      // Try native file share (Web Share API Level 2 — works on iOS Safari,
      // Android Chrome). Fall back to a direct download if unsupported or blocked.
      const canShareFile =
        typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
      if (canShareFile) {
        try {
          await navigator.share({ files: [file], title: plant.germanName });
        } catch {
          // User cancelled — don't count as an error
        }
      } else {
        // Fallback: trigger a browser download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      setShareState("done");
      setTimeout(() => setShareState("idle"), 2000);
    } catch {
      // PDF generation failed silently — reset to idle
      setShareState("idle");
    }
  };

  if (isLoading) {
    return (
      <div className="animate-in fade-in min-h-[60dvh] flex items-center justify-center p-8">
        <PeckingChicken size={110} label="Wird geladen …" className="text-primary" />
      </div>
    );
  }

  if (isError || !plant) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
        <ShieldAlert className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-serif mb-2">Pflanze nicht gefunden</h2>
        <p className="text-muted-foreground mb-6">Diese Analyse ist nicht mehr verfügbar.</p>
        <Button onClick={() => setLocation("/archiv")}>Zurück zum Archiv</Button>
      </div>
    );
  }

  const openDeleteDialog = () => {
    setPw("");
    setPwError(null);
    setPwOpen(true);
  };

  const confirmDelete = () => {
    setPwError(null);
    deletePlant.mutate(
      { id, data: { password: pw } },
      {
        onSuccess: () => {
          // The archive, categories and detail views all read from the shared
          // /api/plants list, so refresh it to drop the deleted entry instead of
          // showing a ghost from the cache.
          void queryClient.invalidateQueries({ queryKey: ["/api/plants"] });
          setPwOpen(false);
          setLocation("/archiv");
        },
        onError: (err) => {
          setPwError(
            err.status === 403
              ? "Falsches Passwort. Bitte versuche es erneut."
              : "Löschen fehlgeschlagen. Bitte versuche es erneut."
          );
        },
      }
    );
  };

  const human = humanBadge(plant);
  const humanSafe = human.safe;
  const selectedLabel = animalLabel(selectedAnimal);
  const animal = animalBadge(plant, selectedAnimal);
  const animalSafe = animal.variant === "safe";
  // Neutral card while an animal's fact sheet is still being generated (legacy
  // plants before the backfill); coloured green/red once it is available.
  const animalCardCls = animalCardClass(animal.variant);
  // Raw fact-sheet data for the detail text sections (toxicity explanation,
  // benefits prose) – separate from the display badge variant above.
  const animalInfo = getAnimalInfo(plant, selectedAnimal);

  // Treatable-symptom tags grouped by target (Mensch first), dropping targets
  // that have no tags. Display only – no dosage/preparation guidance.
  const symptomGroups = HEAL_TARGETS.map((t) => ({
    ...t,
    tags: symptomsFor(plant, t.key),
  })).filter((g) => g.tags.length > 0);

  return (
    <div className="pb-8 animate-in slide-in-from-bottom-4 duration-500">
      {/* Lightbox overlay */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => lbScale <= 1 && setZoomedImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 rounded-full p-2 z-10"
            onClick={() => setZoomedImage(null)}
            aria-label="Schließen"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={zoomedImage}
            alt="Vergrößerte Ansicht"
            className="max-w-full max-h-full object-contain select-none"
            style={{
              transform: `scale(${lbScale}) translate(${lbTx}px, ${lbTy}px)`,
              transformOrigin: "center center",
              transition: lbScale === 1 ? "transform 0.2s ease" : "none",
              touchAction: "none",
              cursor: lbScale > 1 ? "grab" : "default",
            }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={lbTouchStart}
            onTouchMove={lbTouchMove}
            onTouchEnd={lbTouchEnd}
          />
        </div>
      )}

      {/* Fixed back button — always visible at top-left while scrolling */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-40 bg-black/30 hover:bg-black/50 text-white rounded-full backdrop-blur-sm shadow-md"
        onClick={() => plant ? setLocation(`/pflanzen?tab=arten&kat=${viewCategoryOf(plant)}`) : setLocation("/pflanzen?tab=arten")}
        aria-label="Zurück"
      >
        <ArrowLeft className="w-5 h-5" />
      </Button>

      {/* Hidden file input for manual image upload */}
      <input
        ref={imageUploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* Header Image & Actions */}
      <div
        className={`relative h-72 md:h-96 w-full ${!mainIsPlaceholder ? "cursor-zoom-in" : ""}`}
        onClick={() => !mainIsPlaceholder && setZoomedImage(mainImageSrc)}
      >
        {/* pointer-events-none so the click reaches the parent container */}
        <div className="absolute inset-0 bg-black/20 z-10 pointer-events-none" />
        <img
          src={mainImageSrc}
          alt={plant.germanName}
          className={`w-full h-full ${mainIsPlaceholder ? "object-contain p-12" : "object-cover"}`}
        />
        {/* "Bild aktualisieren" — only shown when no real photo exists yet */}
        {mainIsPlaceholder && (
          <div
            className="absolute bottom-20 left-0 right-0 flex justify-center z-20"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="sm"
              variant="secondary"
              className="bg-white/90 hover:bg-white text-foreground shadow-md gap-1.5 rounded-full px-4"
              disabled={imageUploadState === "uploading"}
              onClick={() => imageUploadInputRef.current?.click()}
            >
              {imageUploadState === "uploading" ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Wird hochgeladen…</>
              ) : (
                <><Camera className="w-4 h-4" /> Bild hinzufügen</>
              )}
            </Button>
          </div>
        )}
        {/* Zoom hint — only for real photos */}
        {!mainIsPlaceholder && (
          <div className="absolute bottom-20 right-3 z-20 pointer-events-none">
            <span className="flex items-center gap-1 bg-black/40 text-white/80 text-xs px-2 py-1 rounded-full backdrop-blur-sm">
              <ZoomIn className="w-3 h-3" /> Zum Vergrößern tippen
            </span>
          </div>
        )}
        
        {/* Stop propagation so the buttons don't trigger the zoom handler on the container */}
        <div
          className="absolute top-0 left-0 right-0 p-4 z-20 flex justify-end items-start"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex gap-2">
            {/* Favourite toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="bg-black/20 hover:bg-black/40 text-white rounded-full backdrop-blur-sm transition-colors"
              onClick={() => favorites.toggle(plant.id)}
              disabled={favorites.isPending}
              aria-label={favorites.isFavorite(plant.id) ? "Aus Mein Beet entfernen" : "Zu Mein Beet hinzufügen"}
            >
              <Pin
                className={`w-5 h-5 transition-colors ${favorites.isFavorite(plant.id) ? "fill-amber-400 text-amber-400" : ""}`}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="bg-black/20 hover:bg-black/40 text-white rounded-full backdrop-blur-sm transition-colors"
              onClick={handleShare}
              disabled={shareState === "generating"}
              aria-label="PDF teilen"
            >
              {shareState === "generating" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : shareState === "done" ? (
                <Check className="w-5 h-5 text-emerald-400" />
              ) : (
                <Share2 className="w-5 h-5" />
              )}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="bg-black/20 hover:bg-destructive text-white rounded-full backdrop-blur-sm transition-colors"
              onClick={openDeleteDialog}
              disabled={deletePlant.isPending}
            >
              <Trash2 className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <h1 className="text-3xl font-serif text-white mb-1 shadow-sm">{plant.germanName}</h1>
          <p className="text-white/80 font-serif italic text-lg">{plant.botanicalName}</p>
          {plant.locationRegion && (
            <span className="inline-flex items-center gap-1 text-white/70 text-sm mt-1">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              {plant.locationRegion}
            </span>
          )}
        </div>
      </div>

      {/* Second view from the two-photo mushroom scan.
          Only shown when the side image is available on this device — hide the
          section entirely when it resolves to a placeholder (wrong device /
          storage cleared) rather than showing a generic category illustration. */}
      {plant.hasSideImage && !sideIsPlaceholder && (
        <div className="px-6 pt-6">
          <div
            className="relative rounded-2xl overflow-hidden border cursor-zoom-in"
            onClick={() => setZoomedImage(sideImageSrc)}
          >
            <img
              src={sideImageSrc}
              alt={`${plant.germanName} – Ansicht von der Seite`}
              className="w-full aspect-[4/3] object-cover"
            />
            <span className="absolute bottom-2 left-2 text-xs font-medium bg-black/60 text-white px-2 py-0.5 rounded-full backdrop-blur-sm">
              🍄 Ansicht von der Seite
            </span>
            <span className="absolute top-2 right-2 flex items-center gap-1 bg-black/40 text-white/80 text-xs px-2 py-1 rounded-full backdrop-blur-sm">
              <ZoomIn className="w-3 h-3" />
            </span>
          </div>
        </div>
      )}

      <div className="p-6 space-y-8">
        {/* CRITICAL SAFETY BADGES */}
        <div className="grid grid-cols-2 gap-4">
          {/* Status Mensch */}
          <div className={`p-4 rounded-2xl border ${humanSafe ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30' : 'bg-rose-50 border-rose-200 dark:bg-rose-950/30'} flex flex-col`}>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              Status Mensch
            </span>
            <div className="flex items-center gap-2 mt-auto">
              {humanSafe ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="font-bold text-lg text-emerald-700 dark:text-emerald-300 leading-tight">
                    Ungiftig
                    {plant.humanStatus === "edible" && (
                      <span className="block text-xs normal-case tracking-normal font-semibold mt-0.5 text-emerald-600 dark:text-emerald-400">
                        essbar
                      </span>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span className="font-bold text-lg text-rose-700 dark:text-rose-300 uppercase tracking-wide leading-tight">
                    Achtung
                    {plant.humanToxicityLevel && (
                      <span className={`block text-xs normal-case tracking-normal font-semibold mt-0.5 ${{intolerant: "text-yellow-500", poisonous: "text-orange-500", lethal: "text-red-500"}[plant.humanToxicityLevel]}`}>
                        {{intolerant: "unverträglich", poisonous: "giftig", lethal: "tödlich"}[plant.humanToxicityLevel]}
                      </span>
                    )}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Status Tiere */}
          <div className={`p-4 rounded-2xl border ${animalCardCls} flex flex-col`}>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              Status Tiere
            </span>
            <Select value={selectedAnimal} onValueChange={(v) => handleAnimalChange(v as AnimalKey)}>
              <SelectTrigger className="h-8 text-sm mb-3 bg-background/60" aria-label="Tier auswählen">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANIMALS.map((a) => (
                  <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 mt-auto">
              {animal.variant === "pending" ? (
                <span className="text-sm text-muted-foreground">Wird ergänzt …</span>
              ) : animalSafe ? (
                <>
                  <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="font-bold text-lg text-emerald-700 dark:text-emerald-300">Genießbar</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span className="font-bold text-lg text-rose-700 dark:text-rose-300 uppercase leading-tight tracking-wide">
                    Achtung
                    {animalInfo?.toxicityLevel && (
                      <span className={`block text-xs normal-case tracking-normal font-semibold ${{intolerant: "text-yellow-500", poisonous: "text-orange-500", lethal: "text-red-500"}[animalInfo.toxicityLevel]}`}>
                        {{intolerant: "unverträglich", poisonous: "giftig", lethal: "tödlich"}[animalInfo.toxicityLevel]}
                      </span>
                    )}
                    <span className="block text-xs normal-case tracking-normal">für {selectedLabel}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* DETAILS SECTIONS */}
        <div className="space-y-6">
          <Section 
            title="Erklärung: Mensch" 
            icon={<Info className="w-5 h-5 text-primary" />}
            content={plant.edibilityDetails}
          />
          <Section 
            title={`Erklärung: ${selectedLabel}`}
            icon={<Info className="w-5 h-5 text-primary" />}
            content={animalInfo?.toxicityDetails ?? ""}
          />
          
          <div className="h-px bg-border my-6" />

          {plant.humanStatus === "edible" && (
            plant.category === "edible" || plant.category === "mushroom"
          ) && (
            <Section
              title="Zubereitung"
              icon={<UtensilsCrossed className="w-5 h-5 text-emerald-600" />}
              content={plant.preparation ?? ""}
            />
          )}

          <Section 
            title="Inhaltsstoffe" 
            icon={<Leaf className="w-5 h-5 text-secondary" />}
            content={plant.activeIngredients}
          />

          <Section 
            title="Standort & Vorkommen" 
            icon={<MapPin className="w-5 h-5 text-secondary" />}
            content={plant.habitat}
          />

          <Section 
            title="Standortansprüche" 
            icon={<Mountain className="w-5 h-5 text-secondary" />}
            content={plant.siteConditions}
          />

          <Section 
            title="Weitere Nutzung" 
            icon={<Recycle className="w-5 h-5 text-secondary" />}
            content={plant.otherUses}
          />

          <Section 
            title="Düngung im Eigenanbau" 
            icon={<Sprout className="w-5 h-5 text-secondary" />}
            content={plant.fertilizerTips}
          />
          
          {(plant.humanBenefits || animalInfo?.benefits) && (
            <div className="bg-muted/50 rounded-2xl p-5 space-y-5 border border-muted">
              <h3 className="font-serif text-xl flex items-center gap-2">
                <HeartPulse className="w-5 h-5 text-accent" />
                Heilwirkung
              </h3>
              
              {plant.humanBenefits && (
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">Für den Menschen</h4>
                  <p className="text-foreground leading-relaxed">{plant.humanBenefits}</p>
                </div>
              )}
              
              {animalInfo?.benefits && (
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">Für {selectedLabel}</h4>
                  <p className="text-foreground leading-relaxed">{animalInfo.benefits}</p>
                </div>
              )}
            </div>
          )}

          {symptomGroups.length > 0 && (
            <div className="bg-muted/50 rounded-2xl p-5 space-y-4 border border-muted">
              <h3 className="font-serif text-xl flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-accent" />
                Behandelbare Beschwerden
              </h3>
              {symptomGroups.map((group) => {
                const groupApplications =
                  (plant.symptomApplications as Record<string, Record<string, string>> | undefined)?.[group.key] ?? {};
                return (
                  <div key={group.key}>
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      {group.label}
                    </h4>
                    <div className="flex flex-col gap-2">
                      {group.tags.map((tag) => {
                        const application = groupApplications[tag];
                        return (
                          <div
                            key={tag}
                            className="rounded-xl border border-border bg-background px-4 py-3"
                          >
                            <div className="text-sm font-medium text-foreground">{tag}</div>
                            {application ? (
                              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                                {application}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Aufgabe hinzufügen */}
        <button
          onClick={() => setLocation(`/aufgaben?plantId=${plant.id}`)}
          className="w-full flex items-center gap-3 rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 px-5 py-4 text-left hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors"
        >
          <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-400">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm text-sky-800 dark:text-sky-200">
              Aufgabe hinzufügen
            </p>
            <p className="text-xs text-sky-600 dark:text-sky-400 mt-0.5">
              Erinnerung für Gießen, Düngen und mehr
            </p>
          </div>
        </button>

        <div className="text-xs text-muted-foreground text-center pt-4">
          Gescannt am {format(new Date(plant.createdAt), "dd. MMMM yyyy, HH:mm", { locale: de })}
        </div>
      </div>

      <Dialog
        open={pwOpen}
        onOpenChange={(open) => {
          setPwOpen(open);
          if (!open) setPwError(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">Eintrag löschen</DialogTitle>
            <DialogDescription>
              Zum Löschen von „{plant.germanName}“ ist das Passwort erforderlich.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirmDelete();
            }}
            className="space-y-4"
          >
            <Input
              type="password"
              inputMode="numeric"
              autoFocus
              placeholder="Passwort"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            {pwError && <p className="text-sm text-destructive">{pwError}</p>}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setPwOpen(false)}>
                Abbrechen
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={deletePlant.isPending || pw.length === 0}
              >
                {deletePlant.isPending ? "Löschen..." : "Löschen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, icon, content }: { title: string, icon: React.ReactNode, content: string }) {
  // Trim so whitespace-only content hides the section too (matches the PDF).
  if (!content?.trim()) return null;
  return (
    <div className="space-y-2">
      <h3 className="font-serif text-xl flex items-center gap-2 text-foreground">
        {icon}
        {title}
      </h3>
      <p className="text-muted-foreground leading-relaxed">
        {content}
      </p>
    </div>
  );
}
