import { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Bug, ShieldAlert, Leaf, Minus, MapPin } from "lucide-react";
import type { Insect } from "@workspace/api-client-react";
import { insectImageUrl, insectCategoryPlaceholder } from "@/lib/image";
import { ImageLightbox } from "@/components/image-lightbox";
import { useLocalImage } from "@/lib/use-local-image";

// German labels for the backend enum values.
export const INSECT_CATEGORY_LABELS: Record<string, string> = {
  beetle: "Käfer",
  butterfly: "Schmetterlinge",
  bee_wasp: "Bienen/Wespen",
  fly_mosquito: "Fliegen/Mücken",
  bug_cicada: "Wanzen/Zikaden",
  grasshopper: "Heuschrecken",
  dragonfly: "Libellen",
  spider_other: "Spinnen/Andere",
};

export const INSECT_RELATION_LABELS: Record<string, string> = {
  pest: "Schädling",
  beneficial: "Nützling",
  neutral: "Neutral",
};

function RelationBadge({ status }: { status: string }) {
  if (status === "pest") {
    return (
      <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md bg-rose-100 text-rose-800">
        <ShieldAlert className="w-3 h-3" />
        Schädling
      </span>
    );
  }
  if (status === "beneficial") {
    return (
      <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md bg-emerald-100 text-emerald-800">
        <Leaf className="w-3 h-3" />
        Nützling
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md bg-muted text-muted-foreground">
      <Minus className="w-3 h-3" />
      Neutral
    </span>
  );
}

export function InsectCard({
  insect,
  variant = "community",
}: {
  insect: Insect;
  /**
   * Controls image resolution strategy:
   * - `"community"` (default): renders a text-only row (no image, no icons).
   *   Correct for archive/Arten views where the image lives on the owner's device.
   * - `"private"`: tries IndexedDB first, falls back to the legacy server URL
   *   for old rows, then the category placeholder. Correct for Meine Insekten.
   */
  variant?: "community" | "private";
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const placeholder = insectCategoryPlaceholder(insect.category);
  const { src: imageSrc, isPlaceholder } = useLocalImage(
    variant === "private" ? (insect.localImageId ?? undefined) : undefined,
    variant === "private" ? insectImageUrl(insect.id) : "",
    placeholder,
    variant === "private" ? (insect.imageUrl ?? undefined) : undefined,
  );

  // ── Community / archive view: text-only, no images or icons ────────────────
  if (variant === "community") {
    return (
      <Link href={`/insekt/${insect.id}`}>
        <div className="flex flex-col gap-1.5 p-4 bg-card hover:bg-muted/50 border rounded-2xl transition-all hover:shadow-md cursor-pointer animate-in fade-in slide-in-from-bottom-2">
          <h3 className="font-serif text-lg font-medium text-foreground leading-tight">
            {insect.germanName}
          </h3>
          <p className="text-xs text-muted-foreground italic">{insect.scientificName}</p>
          <p className="text-xs text-muted-foreground">
            {INSECT_CATEGORY_LABELS[insect.category] ?? insect.category}
            {" · "}
            {format(new Date(insect.createdAt), "dd.MM.yyyy", { locale: de })}
            {insect.locationRegion && ` · ${insect.locationRegion}`}
          </p>
          <div className="flex gap-2 mt-0.5">
            <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md ${
              insect.relationStatus === "beneficial"
                ? "bg-emerald-100 text-emerald-800"
                : insect.relationStatus === "pest"
                ? "bg-rose-100 text-rose-800"
                : "bg-muted text-muted-foreground"
            }`}>
              {INSECT_RELATION_LABELS[insect.relationStatus] ?? insect.relationStatus}
            </span>
          </div>
        </div>
      </Link>
    );
  }

  // ── Private view: full layout with image and lightbox ──────────────────────
  return (
    <>
      {!isPlaceholder && (
        <ImageLightbox
          src={imageSrc}
          alt={insect.germanName}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      <Link href={`/insekt/${insect.id}`}>
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
            alt={insect.germanName}
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
          <div className="flex items-start gap-1 min-w-0">
            <h3 className="font-serif text-lg font-medium text-foreground truncate">
              {insect.germanName}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground italic truncate mb-1">
            {insect.scientificName}
          </p>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <p className="text-xs text-muted-foreground">
              {INSECT_CATEGORY_LABELS[insect.category] ?? insect.category} ·{" "}
              {format(new Date(insect.createdAt), "dd.MM.yyyy", { locale: de })}
            </p>
            {insect.locationRegion && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3 shrink-0" />
                {insect.locationRegion}
              </span>
            )}
          </div>
          <div className="mt-auto flex gap-2">
            <RelationBadge status={insect.relationStatus} />
          </div>
        </div>
      </div>
      </Link>
    </>
  );
}
