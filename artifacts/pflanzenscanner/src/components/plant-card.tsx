import { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { ShieldAlert, ShieldCheck, Sparkles, Pin, MapPin } from "lucide-react";
import { Plant } from "@workspace/api-client-react";
import { plantImageUrl, plantCategoryPlaceholder } from "@/lib/image";
import { ImageLightbox } from "@/components/image-lightbox";
import { useLocalImage } from "@/lib/use-local-image";

/** Text-only row rendered in community/archive views (no image, no icons). */
function PlantCardTextOnly({
  plant,
  isFavorite,
  onToggleFavorite,
}: {
  plant: Plant;
  isFavorite?: boolean;
  onToggleFavorite?: (plantId: number) => void;
}) {
  const isHumanSafe = plant.humanStatus === "edible";
  const isPoultrySafe = plant.poultryStatus === "safe";

  return (
    <Link href={`/pflanze/${plant.id}`}>
      <div className="flex flex-col gap-1.5 p-4 bg-card hover:bg-muted/50 border rounded-2xl transition-all hover:shadow-md cursor-pointer animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-serif text-lg font-medium text-foreground leading-tight">
            {plant.germanName}
          </h3>
          {onToggleFavorite && (
            <button
              type="button"
              aria-label={isFavorite ? "Aus Mein Beet entfernen" : "Zu Mein Beet hinzufügen"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite(plant.id);
              }}
              className="shrink-0 p-1 -mr-1 -mt-0.5 rounded-full transition-colors hover:bg-muted"
            >
              <Pin
                className={`w-4 h-4 transition-colors ${isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
              />
            </button>
          )}
        </div>

        {plant.botanicalName && (
          <p className="text-xs text-muted-foreground italic">{plant.botanicalName}</p>
        )}

        <p className="text-xs text-muted-foreground">
          {format(new Date(plant.createdAt), "dd.MM.yyyy", { locale: de })}
          {plant.locationRegion && ` · ${plant.locationRegion}`}
        </p>

        <div className="flex gap-2 mt-0.5">
          <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md ${isHumanSafe ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
            Mensch
          </span>
          <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md ${isPoultrySafe ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
            Geflügel
          </span>
        </div>
      </div>
    </Link>
  );
}

export function PlantCard({
  plant,
  variant = "community",
  matchedSymptoms,
  onSymptomClick,
  isFavorite,
  onToggleFavorite,
}: {
  plant: Plant;
  /**
   * Controls image resolution strategy:
   * - `"community"` (default): always renders the category placeholder without
   *   touching IndexedDB. Correct for archive/search views where the image
   *   lives on another user's device.
   * - `"private"`: tries IndexedDB first, falls back to the legacy server URL
   *   for old rows, then the category placeholder. Correct for Mein Beet /
   *   Meine Scans where the viewer owns the scans.
   */
  variant?: "community" | "private";
  // Symptom tags that caused this plant to match the current Kräuter-Hexe
  // query/selection. Shown as highlighted chips so the user sees *why* the
  // plant was surfaced. Omitted on non-search listings (archive, categories).
  matchedSymptoms?: string[];
  // Optional callback invoked when a matched-symptom chip is tapped. When
  // provided the chip becomes interactive and adds that ailment to the filter.
  onSymptomClick?: (tag: string) => void;
  // When provided, a favourite-star toggle is rendered in the card's top-right
  // corner. Tapping it adds/removes the plant from the user's favourites
  // without navigating away.
  isFavorite?: boolean;
  onToggleFavorite?: (plantId: number) => void;
}) {
  // ── Community / archive view: text-only, no images or icons ────────────────
  if (variant === "community") {
    return (
      <PlantCardTextOnly
        plant={plant}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
      />
    );
  }

  // ── Private view: full layout with image and lightbox ──────────────────────
  const isHumanSafe = plant.humanStatus === "edible";
  const isPoultrySafe = plant.poultryStatus === "safe";
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const placeholder = plantCategoryPlaceholder(plant.category);
  const { src: imageSrc, isPlaceholder } = useLocalImage(
    plant.localImageId ?? undefined,
    plantImageUrl(plant.id),
    placeholder,
    plant.imageUrl,
  );

  return (
    <>
      {/* Lightbox is only useful for real photos, not category illustrations. */}
      {!isPlaceholder && (
        <ImageLightbox
          src={imageSrc}
          alt={plant.germanName}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      <Link href={`/pflanze/${plant.id}`}>
        <div className="group flex gap-4 p-4 bg-card hover:bg-muted/50 border rounded-2xl transition-all hover:shadow-md cursor-pointer overflow-hidden animate-in fade-in slide-in-from-bottom-2">
          {/* Image thumbnail — tap opens lightbox only for real photos */}
          <div
            className={`w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-muted relative ${!isPlaceholder ? "cursor-zoom-in" : ""}`}
            onClick={
              !isPlaceholder
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setLightboxOpen(true);
                  }
                : undefined
            }
            title={!isPlaceholder ? "Bild vergrößern" : undefined}
          >
            <img
              src={imageSrc}
              alt={plant.germanName}
              loading="lazy"
              className={`w-full h-full transition-transform ${isPlaceholder ? "object-contain" : "object-cover group-hover:scale-105"}`}
            />
            {/* Subtle zoom hint — only for real photos */}
            {!isPlaceholder && (
              <div className="absolute inset-0 bg-black/0 hover:bg-black/15 transition-colors flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white drop-shadow text-lg">🔍</span>
              </div>
            )}
          </div>

          <div className="flex flex-col flex-1 min-w-0 py-1">
            <div className="flex items-start justify-between gap-1">
              <h3 className="font-serif text-lg font-medium text-foreground truncate">{plant.germanName}</h3>
              {/* Favourite star — only rendered when the parent passes the prop */}
              {onToggleFavorite && (
                <button
                  type="button"
                  aria-label={isFavorite ? "Aus Mein Beet entfernen" : "Zu Mein Beet hinzufügen"}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleFavorite(plant.id);
                  }}
                  className="shrink-0 p-1 -mr-1 -mt-0.5 rounded-full transition-colors hover:bg-muted"
                >
                  <Pin
                    className={`w-4 h-4 transition-colors ${isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                  />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <p className="text-xs text-muted-foreground">
                {format(new Date(plant.createdAt), "dd.MM.yyyy", { locale: de })}
              </p>
              {plant.locationRegion && (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3 shrink-0" />
                  {plant.locationRegion}
                </span>
              )}
            </div>

            <div className="mt-auto flex gap-2">
              <div className={`flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md ${isHumanSafe ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                {isHumanSafe ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                Mensch
              </div>
              <div className={`flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md ${isPoultrySafe ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                {isPoultrySafe ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                Geflügel
              </div>
            </div>

            {matchedSymptoms && matchedSymptoms.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1.5">
                  Hilft bei
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {matchedSymptoms.map((tag) =>
                    onSymptomClick ? (
                      <button
                        key={tag}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSymptomClick(tag);
                        }}
                        aria-label={`Nach „${tag}" filtern`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-800 border border-indigo-200 hover:bg-indigo-200 hover:border-indigo-300 transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3 shrink-0" />
                        {tag}
                      </button>
                    ) : (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-800 border border-indigo-200"
                      >
                        <Sparkles className="w-3 h-3 shrink-0" />
                        {tag}
                      </span>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Link>
    </>
  );
}
