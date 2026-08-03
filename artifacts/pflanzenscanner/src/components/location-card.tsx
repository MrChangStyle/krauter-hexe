/**
 * LocationCard — shown once per session to ask if the user wants to attach
 * their coarse location to a scan. Used as a fixed overlay in scan pages.
 */
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UseLocationRegionReturn } from "@/lib/use-location-region";

export function LocationCard({ loc }: { loc: UseLocationRegionReturn }) {
  if (loc.cardState === "hidden") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-card rounded-2xl shadow-xl border p-6 space-y-4 animate-in zoom-in-95 duration-200">

        {loc.cardState === "asking" && (
          <>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <h2 className="font-semibold text-base leading-tight">
                Fundort speichern?
              </h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Soll der ungefähre Standort (z.B.{" "}
              <span className="font-medium">München</span>) zum Archiveintrag
              hinzugefügt werden?{" "}
              <strong>Es werden keine GPS-Koordinaten gespeichert.</strong>
            </p>
            <div className="flex gap-2">
              <Button onClick={loc.onGrant} className="flex-1">
                <MapPin className="w-4 h-4 mr-1.5" />
                Ja, erlauben
              </Button>
              <Button variant="outline" onClick={loc.onDeny} className="flex-1">
                Nein danke
              </Button>
            </div>
          </>
        )}

        {loc.cardState === "locating" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Standort wird ermittelt …</p>
          </div>
        )}

        {loc.cardState === "manual" && (
          <>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/40 text-amber-600 shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <h2 className="font-semibold text-base leading-tight">
                Ort eingeben
              </h2>
            </div>
            {loc.geoError && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {loc.geoError}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Optional: Gib einen Ort ein (z.B. „München" oder „Bayern").
            </p>
            <Input
              placeholder="z.B. München"
              value={loc.manualRegion}
              onChange={(e) => loc.setManualRegion(e.target.value.slice(0, 80))}
              onKeyDown={(e) => e.key === "Enter" && loc.onManualSubmit()}
              autoFocus
              maxLength={80}
            />
            <div className="flex gap-2">
              <Button onClick={loc.onManualSubmit} className="flex-1">
                Speichern
              </Button>
              <Button variant="outline" onClick={loc.onDeny} className="flex-1">
                Überspringen
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
