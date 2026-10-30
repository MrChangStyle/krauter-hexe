import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, ChevronRight, Info, Loader2, Plus } from "lucide-react";
import {
  useCreateBeeColony,
  useEnsureOwnFarm,
  useGetBeeOverview,
  type BeeColony,
  type BeeHint,
  type FarmSummary,
} from "@workspace/api-client-react";
import { BeeSiteCheckSection } from "@/components/bee-site-check";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { COLONY_STATUS, HIVE_TYPES, queenColor } from "@/lib/bee-labels";
import { deDay } from "@/lib/medicine-labels";
import { num } from "@/lib/yield-labels";
import { PageHeader } from "@/components/page-header";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

export function BeeHintLine({ hint, name }: { hint: BeeHint; name?: string }) {
  return (
    <li
      className={`flex gap-2.5 rounded-xl border p-3 text-sm ${
        hint.urgent ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40" : "border-border bg-card"
      }`}
    >
      {hint.urgent ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      ) : (
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      )}
      <span>
        {name && <span className="font-medium">{name}: </span>}
        {hint.text}
      </span>
    </li>
  );
}

export function QueenDot({ year }: { year: number | null }) {
  if (year === null) return null;
  const color = queenColor(year);
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color.className}`} title={`Königin ${year} (${color.name})`} aria-hidden="true" />;
}

function NewColonyDialog({ farm, apiaries, open, onOpenChange }: { farm: FarmSummary; apiaries: string[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [apiary, setApiary] = useState("");
  const [hiveType, setHiveType] = useState("");
  const [queenYear, setQueenYear] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateBeeColony({
    mutation: {
      onSuccess: (detail) => setLocation(`/farm/bienen/${detail.colony.id}`),
      onError: (err) => setError(errorText(err, "Das hat nicht geklappt.")),
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    create.mutate({
      farmId: farm.id,
      data: { name, apiary: apiary || null, hiveType: hiveType || null, queenYear: queenYear ? Number(queenYear) : null, startedOn: null },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>Volk anlegen</DialogTitle>
            <DialogDescription>Alles außer dem Namen lässt sich später ergänzen.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bee-name">Name *</Label>
            <Input id="bee-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Linde, Volk 3" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bee-apiary">Bienenstand</Label>
              <Input id="bee-apiary" list="bee-apiaries" maxLength={80} value={apiary} onChange={(e) => setApiary(e.target.value)} placeholder="z. B. Obstwiese" />
              <datalist id="bee-apiaries">
                {apiaries.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bee-hive">Beute</Label>
              <Input id="bee-hive" list="bee-hives" maxLength={40} value={hiveType} onChange={(e) => setHiveType(e.target.value)} placeholder="z. B. Zander" />
              <datalist id="bee-hives">
                {HIVE_TYPES.map((h) => (
                  <option key={h} value={h} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bee-queen">Jahrgang der Königin</Label>
            <Input id="bee-queen" type="number" min={2000} max={new Date().getFullYear()} value={queenYear} onChange={(e) => setQueenYear(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={create.isPending} className="w-full gap-2">
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Anlegen
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ColonyCard({ c }: { c: BeeColony }) {
  return (
    <Link href={`/farm/bienen/${c.id}`} className="flex gap-3 rounded-xl border bg-card p-3 text-sm hover:bg-muted/50">
      {c.photoUrl && <img src={c.photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{c.name}</span>
          <QueenDot year={c.queenYear} />
          {c.status !== "active" && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{COLONY_STATUS[c.status]}</span>}
          <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">
          {[c.apiary, c.hiveType].filter(Boolean).join(" · ") || "Ohne Stand"}
        </p>
        {c.status === "active" && (
          <p className="mt-1 text-xs text-muted-foreground">
            {c.lastInspectionOn ? `Durchsicht ${deDay(c.lastInspectionOn)}` : "Noch keine Durchsicht"}
            {c.beeFrames !== null ? ` · ${c.beeFrames} Waben` : ""}
            {c.lastMites ? ` · ${num(c.lastMites.mitesPerDay)} Milben/Tag` : ""}
            {c.honeyKgThisYear > 0 ? ` · ${num(c.honeyKgThisYear)} kg Honig` : ""}
          </p>
        )}
      </div>
    </Link>
  );
}

function Overview({ farm }: { farm: FarmSummary }) {
  const overview = useGetBeeOverview(farm.id);
  const [creating, setCreating] = useState(false);
  const canWrite = farm.role !== "guest";
  const d = overview.data;
  if (overview.isLoading) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  if (!d) return <p className="text-sm text-muted-foreground">Die Völker lassen sich gerade nicht laden.</p>;
  const active = d.colonies.filter((c) => c.status === "active");
  const ended = d.colonies.filter((c) => c.status !== "active");
  const hints = active.flatMap((c) => c.hints.map((h) => ({ h, name: c.name }))).sort((a, b) => Number(b.h.urgent) - Number(a.h.urgent));

  return (
    <div className="space-y-5">
      {d.colonies.length > 0 && (
        <section className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">Völker</p>
            <p className="text-lg font-semibold" data-testid="bees-active">{d.active}</p>
            <p className="text-xs text-muted-foreground">aktiv</p>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">Honig {d.year}</p>
            <p className="text-lg font-semibold">{num(d.honeyKgThisYear)} kg</p>
            <Link href="/farm/ertrag" className="text-xs text-primary">
              in Ertrag & Bilanz
            </Link>
          </div>
        </section>
      )}

      {hints.length > 0 && (
        <ul className="space-y-2" aria-label="Was ansteht">
          {hints.map(({ h, name }) => (
            <BeeHintLine key={`${h.colonyId}-${h.kind}`} hint={h} name={name} />
          ))}
        </ul>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Völker</h2>
          {canWrite && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Volk
            </Button>
          )}
        </div>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Völker. Lege jedes Volk einmal an – dann trägst du Durchsicht, Fütterung, Varroa und Honig auf seiner Stockkarte ein.
          </p>
        ) : (
          <div className="space-y-2">
            {active.map((c) => (
              <ColonyCard key={c.id} c={c} />
            ))}
          </div>
        )}
        {ended.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Frühere Völker ({ended.length})</summary>
            <div className="space-y-2 pt-2">
              {ended.map((c) => (
                <ColonyCard key={c.id} c={c} />
              ))}
            </div>
          </details>
        )}
      </section>
      <BeeSiteCheckSection farm={farm} apiaries={d.apiaries} />
      <p className="text-xs text-muted-foreground">
        Bienenvölker müssen beim Veterinäramt gemeldet sein (Bienenseuchen-Verordnung). Die Hinweise sind Richtwerte – im Zweifel mit dem Bienensachverständigen abstimmen.
      </p>
      {canWrite && <NewColonyDialog farm={farm} apiaries={d.apiaries} open={creating} onOpenChange={setCreating} />}
    </div>
  );
}

/** /farm/bienen – the farm's colonies (docs/bienen.md). */
export default function BienenPage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="bienen" subtitle="Stockkarte für jedes Volk: Durchsicht, Fütterung, Varroa und Honig." />
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Overview farm={farm} />}
    </div>
  );
}
