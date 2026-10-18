import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, CalendarDays, ChevronRight, Fence, Loader2, MapPin, Plus } from "lucide-react";
import { FrostWarnings } from "@/components/garden-overview";
import { useEnsureOwnFarm, useListBeds, type FarmSummary } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { BED_TYPE_LABELS, bedArea, bedSize, dayMonth } from "@/lib/garden-labels";

function BedList({ farm }: { farm: FarmSummary }) {
  const beds = useListBeds(farm.id);
  const canWrite = farm.role !== "guest";
  const list = beds.data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Fence className="h-4 w-4 text-primary" />
          Beete
          {list.length > 0 && <span className="text-sm font-normal text-muted-foreground">({list.length})</span>}
        </h2>
        {canWrite && (
          <Button asChild size="sm" className="gap-1.5">
            <Link href={`/beete/${farm.id}/neu`}>
              <Plus className="h-4 w-4" />
              Beet anlegen
            </Link>
          </Button>
        )}
      </div>

      <FrostWarnings farmId={farm.id} />
      {list.length > 0 && (
        <Link
          href="/beete/kalender"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm transition-colors hover:bg-muted/50"
        >
          <CalendarDays className="h-5 w-5 text-primary" />
          <span className="flex-1">
            <span className="block font-medium">Gartenkalender</span>
            <span className="block text-xs text-muted-foreground">Säen, pflanzen, ernten – Monat für Monat</span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      )}

      {beds.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <Fence className="mx-auto mb-2 h-8 w-8 text-primary/70" />
          <p className="font-medium">Noch keine Beete</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canWrite
              ? "Leg dein erstes Beet an – mit Maßen, Standort und Boden. Danach planst du, was wann hineinkommt."
              : "Auf dieser Farm sind noch keine Beete eingetragen."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((b) => (
            <li key={b.id}>
              <Link
                href={`/beete/${farm.id}/${b.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/50"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Fence className="h-5 w-5 text-primary" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{b.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {BED_TYPE_LABELS[b.type]} · {bedSize(b)} · {bedArea(b)}
                  </span>
                  <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {b.postalCode ?? (b.latitude !== null ? "GPS-Standort" : "kein Standort")} · letzter Frost {dayMonth(b.lastFrost)}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** /beete – Beet-Architekt: the beds of the active farm. */
export default function BeetePage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/pflanzen" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Pflanzen
      </Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Beet-Architekt</p>
        <h1 className="text-2xl font-bold">Beete planen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {farm ? `Beete von „${farm.name}“ – geteilt mit allen Mitgliedern der Farm.` : "Beete deiner Farm."}
        </p>
      </div>
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <BedList farm={farm} />}
    </div>
  );
}
