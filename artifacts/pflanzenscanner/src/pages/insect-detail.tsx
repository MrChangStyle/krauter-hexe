import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft,
  Bug,
  Leaf,
  ShieldAlert,
  Minus,
  Info,
  Sprout,
  Wrench,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useListInsects } from "@workspace/api-client-react";
import { insectImageUrl, insectCategoryPlaceholder } from "@/lib/image";
import { ImageLightbox } from "@/components/image-lightbox";
import { useLocalImage } from "@/lib/use-local-image";
import { PeckingChicken } from "@/components/pecking-chicken";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  INSECT_CATEGORY_LABELS,
  INSECT_RELATION_LABELS,
} from "@/components/insect-card";

export default function InsectDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Read from the shared list query so the detail page benefits from the cache.
  // Archive reads are purely cache lookups — useListInsects pulls from the
  // React Query list cache seeded at list time; it never triggers an AI call.
  // Only POST /insects/scan invokes the AI.
  const { data: insects, isLoading, isError } = useListInsects({
    query: { queryKey: ["/api/insects"] },
  });
  const insect = insects?.find((i) => i.id === id);

  // Local-first image resolution (hook must be called before any early return).
  // Detail pages are always "private": try IndexedDB, fall back to placeholder.
  const { src: imageSrc, isPlaceholder } = useLocalImage(
    insect?.localImageId ?? undefined,
    insect ? insectImageUrl(insect.id) : "",
    insect ? insectCategoryPlaceholder(insect.category) : `${import.meta.env.BASE_URL}placeholders/insect-beetle.svg`,
    insect?.imageUrl,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <PeckingChicken size={100} label="Insekt wird geladen …" className="text-primary" />
      </div>
    );
  }

  if (isError || !insect) {
    return (
      <div className="px-4 pt-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation(-1 as never)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Zurück
        </Button>
        <p className="text-sm text-destructive py-8 text-center">
          Insekt nicht gefunden.
        </p>
      </div>
    );
  }

  const isPest = insect.relationStatus === "pest";
  const isBeneficial = insect.relationStatus === "beneficial";

  return (
    <div className="pb-10">
      {/* Lightbox only makes sense for a real photo, not a category illustration. */}
      {!isPlaceholder && (
        <ImageLightbox
          src={imageSrc}
          alt={insect.germanName}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* Hero image — tap to enlarge (real photos only) */}
      <div
        className={`relative w-full aspect-[4/3] bg-muted overflow-hidden ${!isPlaceholder ? "cursor-zoom-in" : ""}`}
        onClick={() => !isPlaceholder && setLightboxOpen(true)}
        title={!isPlaceholder ? "Bild vergrößern" : undefined}
      >
        <img
          src={imageSrc}
          alt={insect.germanName}
          className={`w-full h-full ${isPlaceholder ? "object-contain p-12" : "object-cover"}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Back button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setLocation(-1 as never);
          }}
          className="absolute top-4 left-4 flex items-center gap-1.5 bg-black/40 hover:bg-black/60 text-white rounded-full px-3 py-1.5 text-sm font-medium backdrop-blur-sm transition-colors"
          aria-label="Zurück"
        >
          <ArrowLeft className="w-4 h-4" />
          Zurück
        </button>

        {/* Name overlay */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
          <h1 className="text-2xl font-bold text-white drop-shadow">
            {insect.germanName}
          </h1>
          <p className="text-sm text-white/80 italic">{insect.scientificName}</p>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-5">
        {/* Category + relation badges */}
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            <Bug className="w-4 h-4" />
            {INSECT_CATEGORY_LABELS[insect.category] ?? insect.category}
          </span>

          {isPest && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
              <ShieldAlert className="w-4 h-4" />
              Schädling
            </span>
          )}
          {isBeneficial && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Leaf className="w-4 h-4" />
              Nützling
            </span>
          )}
          {!isPest && !isBeneficial && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-muted text-muted-foreground">
              <Minus className="w-4 h-4" />
              Neutral
            </span>
          )}
        </div>

        {/* Meta */}
        <p className="text-xs text-muted-foreground">
          Gescannt am {format(new Date(insect.createdAt), "dd. MMMM yyyy", { locale: de })}
          {insect.plantContext && (
            <> · Gefunden auf: <span className="font-medium">{insect.plantContext}</span></>
          )}
        </p>
        {insect.locationRegion && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 shrink-0" />
            {insect.locationRegion}
          </span>
        )}

        {/* Description */}
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 font-semibold text-base">
            <Info className="w-4 h-4 text-muted-foreground" />
            Beschreibung
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {insect.description || "Keine Beschreibung vorhanden."}
          </p>
        </section>

        {/* Affected plants */}
        {insect.affectedPlants && insect.affectedPlants.length > 0 && (
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 font-semibold text-base">
              <Sprout className="w-4 h-4 text-muted-foreground" />
              {isPest ? "Befällt / schadet" : "Besucht / bestäubt"}
            </h2>
            <div className="flex flex-wrap gap-2">
              {insect.affectedPlants.map((plant) => (
                <span
                  key={plant}
                  className="px-2.5 py-1 rounded-full text-sm bg-muted text-foreground border"
                >
                  {plant}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Treatment tips — only for pests */}
        {isPest && insect.treatmentTips && (
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 font-semibold text-base">
              <Wrench className="w-4 h-4 text-muted-foreground" />
              Biologische Bekämpfung
            </h2>
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 p-4">
              <p className="text-sm text-foreground leading-relaxed">
                {insect.treatmentTips}
              </p>
            </div>
          </section>
        )}

        {/* Beneficial callout */}
        {isBeneficial && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-4 flex gap-3">
            <Leaf className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-sm text-foreground leading-relaxed">
              Dieses Tier ist ein Nützling – es schützt deinen Garten, indem es Schädlinge
              frisst oder Blüten bestäubt. Bitte nicht bekämpfen!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
