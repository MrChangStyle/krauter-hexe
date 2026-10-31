import { lazy, Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Map as MapIcon, MapPin, ShieldCheck } from "lucide-react";
import {
  getGetSettingsQueryKey,
  getListFindSpotsQueryKey,
  useGetSettings,
  useListFindSpots,
  useSetSettings,
  type FindSpotKind,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { allowMap, mapAllowed } from "@/lib/pasture-map";

/**
 * Fundorte (docs/fundorte.md): the shared map of where a species of the
 * archive was found. Anonymous, rounded to ~2 km (protected species ~25 km),
 * month only – and only finds of accounts that said yes.
 */

const FindSpotsMap = lazy(() => import("@/components/find-spots-map"));

export const FIND_SPOTS_TEXT =
  "Dein Fundort erscheint anonym auf der gemeinsamen Karte im Archiv – ohne Namen, auf etwa 2 km gerundet, nur mit Monat und Jahr. Den genauen Standort rundet die App schon auf deinem Handy; er wird nie gesendet. Geschützte Arten zeigt die Karte nur sehr grob.";

function useFindSpotsConsent() {
  const queryClient = useQueryClient();
  const settings = useGetSettings();
  const save = useSetSettings({
    mutation: { onSuccess: (data) => queryClient.setQueryData(getGetSettingsQueryKey(), data) },
  });
  return { value: settings.data?.shareFindSpots, loaded: !!settings.data, save };
}

/**
 * Asked once, on the scan page, before the first find could go on the map.
 * Nothing is shared until the account says yes.
 */
export function FindSpotsConsentCard() {
  const { value, loaded, save } = useFindSpotsConsent();
  if (!loaded || value !== null) return null;
  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm" data-testid="find-spots-consent">
      <p className="flex items-center gap-2 font-medium">
        <MapPin className="h-4 w-4 text-primary" />
        Fundorte auf der gemeinsamen Karte zeigen?
      </p>
      <p className="text-muted-foreground">{FIND_SPOTS_TEXT}</p>
      <p className="text-xs text-muted-foreground">Du kannst das jederzeit unter Mehr → Konto ändern. Schaltest du es ab, verschwinden auch deine bisherigen Fundorte von der Karte.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ data: { shareFindSpots: true } })}>
          Ja, anonym zeigen
        </Button>
        <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate({ data: { shareFindSpots: false } })}>
          Nein, danke
        </Button>
      </div>
    </section>
  );
}

/** The switch under Mehr → Konto. Off also removes the own finds from the map. */
export function FindSpotsSwitch() {
  const { value, loaded, save } = useFindSpotsConsent();
  if (!loaded) return null;
  return (
    <label className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm" data-testid="find-spots-switch">
      <span className="flex gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          <span className="block font-medium">Fundorte anonym teilen</span>
          <span className="block text-xs text-muted-foreground">
            Deine Funde erscheinen ohne Namen und auf etwa 2 km gerundet auf der gemeinsamen Karte. Aus: Deine bisherigen Fundorte werden gelöscht.
          </span>
        </span>
      </span>
      <Switch
        checked={value === true}
        disabled={save.isPending}
        aria-label="Fundorte anonym teilen"
        onCheckedChange={(on) => {
          if (!on && !window.confirm("Fundorte nicht mehr teilen? Deine bisherigen Fundorte werden von der Karte gelöscht.")) return;
          save.mutate({ data: { shareFindSpots: on } });
        }}
      />
    </label>
  );
}

const OSM_NOTE = "Die Kartenbilder kommen von OpenStreetMap; deren Server sieht dabei deine IP-Adresse.";

/** "Fundorte" on the detail page of a species in the archive. */
export function FindSpotsSection({ kind, speciesId }: { kind: FindSpotKind; speciesId: number }) {
  const [shown, setShown] = useState(mapAllowed);
  const params = { kind, speciesId };
  const spots = useListFindSpots(params, { query: { enabled: shown, staleTime: 5 * 60_000, queryKey: getListFindSpotsQueryKey(params) } });
  const map = spots.data;
  return (
    <section className="space-y-2" data-testid="find-spots">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <MapPin className="h-4 w-4" />
        Fundorte
      </h3>
      {!shown ? (
        <div className="rounded-xl border border-dashed p-3 text-sm">
          <p className="text-muted-foreground">Wo wurde diese Art gefunden? Die Karte zeigt die Funde aller, die ihre Fundorte teilen – anonym und gerundet.</p>
          <p className="mt-1 text-xs text-muted-foreground">{OSM_NOTE}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 gap-1.5"
            onClick={() => {
              allowMap();
              setShown(true);
            }}
          >
            <MapIcon className="h-4 w-4" />
            Karte zeigen
          </Button>
        </div>
      ) : spots.isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !map ? (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">Die Fundorte konnten nicht geladen werden.</p>
      ) : map.finds === 0 ? (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">Noch keine geteilten Fundorte. Scanne die Art unterwegs – mit „Fundorte anonym teilen“ erscheint dein Fund hier.</p>
      ) : (
        <>
          <Suspense
            fallback={
              <div className="flex h-64 items-center justify-center rounded-xl border">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            }
          >
            <FindSpotsMap cells={map.cells} cellKm={map.cellKm} />
          </Suspense>
          <p className="text-xs text-muted-foreground">
            {map.finds} {map.finds === 1 ? "Fund" : "Funde"}, je Feld etwa {map.cellKm} × {map.cellKm} km.
          </p>
          {map.protectedSpecies && (
            <p className="flex gap-1.5 text-xs text-muted-foreground" data-testid="find-spots-protected">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
              Geschützte Art: Die Fundorte sind absichtlich nur grob gezeigt. Bitte nicht ausgraben oder pflücken.
            </p>
          )}
        </>
      )}
    </section>
  );
}
