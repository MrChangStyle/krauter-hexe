import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getImage } from "@/lib/image-store";
import { resolvePhotoChoice, usePhotoChoice, type PhotoKind } from "@/lib/my-photos";

function useImageSrc(localId: string | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!localId) return;
    let cancelled = false;
    getImage(localId)
      .then((d) => !cancelled && setSrc(d ?? null))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [localId]);
  return src;
}

/**
 * Shown on a detail page after a repeat scan: which photo stays in
 * "Meine Scans"? The other one is deleted from the device.
 */
export function PhotoChoiceCard({ kind, id }: { kind: PhotoKind; id: number }) {
  const choice = usePhotoChoice(kind, id);
  const oldSrc = useImageSrc(choice?.oldLocalId);
  const newSrc = useImageSrc(choice?.newLocalId);
  const [busy, setBusy] = useState(false);

  if (!choice) return null;

  const keep = async (which: "old" | "new") => {
    setBusy(true);
    try {
      await resolvePhotoChoice(kind, id, which);
    } finally {
      setBusy(false);
    }
  };

  const tile = (src: string | null, label: string, which: "old" | "new") => (
    <div className="flex-1 min-w-0 space-y-2">
      <div className="aspect-square rounded-xl overflow-hidden bg-muted flex items-center justify-center">
        {src ? (
          <img src={src} alt={label} className="w-full h-full object-cover" />
        ) : (
          <Camera className="w-6 h-6 text-muted-foreground" />
        )}
      </div>
      <Button
        size="sm"
        variant={which === "new" ? "default" : "outline"}
        className="w-full"
        disabled={busy}
        onClick={() => void keep(which)}
      >
        {label} behalten
      </Button>
    </div>
  );

  return (
    <div className="rounded-2xl border bg-card shadow-sm p-4 space-y-3 animate-in fade-in slide-in-from-top-1">
      <div className="space-y-1">
        <p className="font-semibold text-sm">Schon in deinen Scans</p>
        <p className="text-xs text-muted-foreground">
          Welches Foto soll in „Meine Scans“ bleiben? Das andere wird von deinem
          Gerät gelöscht, damit es keinen Speicher belegt.
        </p>
      </div>
      <div className="flex gap-3">
        {tile(oldSrc, "Altes Foto", "old")}
        {tile(newSrc, "Neues Foto", "new")}
      </div>
    </div>
  );
}
