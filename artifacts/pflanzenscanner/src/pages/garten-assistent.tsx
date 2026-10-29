import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import {
  getGetGardenGoalsQueryKey,
  getGetGardenPlanQueryKey,
  useEnsureOwnFarm,
  useGetGardenCatalog,
  useGetGardenGoals,
  useGetGardenPlan,
  useSaveGardenGoals,
  type FarmSummary,
  type GardenDirection,
  type GardenGoals,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HenniTip } from "@/components/henni";
import { PremiumBadge } from "@/components/premium-badge";
import { useToast } from "@/hooks/use-toast";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { cn } from "@/lib/utils";

const DIRECTIONS: [GardenDirection, string][] = [
  ["vegetables", "Gemüse"],
  ["storage", "Lagergemüse"],
  ["herbs", "Kräuter"],
  ["fruit", "Obst & Beeren"],
];

const SPECIES_DE: Record<string, string> = {
  poultry: "Geflügel",
  rabbit: "Kaninchen",
  guineaPig: "Meerschweinchen",
  cat: "Katzen",
  horse: "Pferde",
  dog: "Hunde",
  goat: "Ziegen",
  sheep: "Schafe",
  cattle: "Rinder",
  pig: "Schweine",
  alpaca: "Alpakas",
  goose: "Gänse",
  duck: "Enten",
  turkey: "Puten",
  quail: "Wachteln",
  rhea: "Nandus",
  donkey: "Esel",
  other: "Sonstige",
};

const m2 = (n: number) => `${n.toLocaleString("de-DE")} m²`;
const kg = (n: number) => `${n.toLocaleString("de-DE")} kg`;

function GoalsForm({ farm, goals }: { farm: FarmSummary; goals: GardenGoals }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canWrite = farm.role !== "guest";
  const [form, setForm] = useState({
    people: String(goals.people),
    animalShare: goals.animalShare,
    directions: goals.directions,
    hours: goals.hoursPerWeek === null ? "" : String(goals.hoursPerWeek),
  });
  const save = useSaveGardenGoals({
    mutation: {
      onSuccess(saved) {
        queryClient.setQueryData(getGetGardenGoalsQueryKey(farm.id), saved);
        void queryClient.invalidateQueries({ queryKey: getGetGardenPlanQueryKey(farm.id) });
        toast({ title: "Ziele gespeichert" });
      },
      onError: () => toast({ title: "Nicht gespeichert", description: "Bitte prüfe deine Angaben.", variant: "destructive" }),
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate({
      farmId: farm.id,
      data: {
        people: Math.max(0, Math.round(Number(form.people) || 0)),
        animalShare: form.animalShare,
        directions: form.directions,
        hoursPerWeek: form.hours.trim() === "" ? null : Math.max(0, Math.round(Number(form.hours) || 0)),
      },
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <fieldset disabled={!canWrite} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-people">Personen im Haushalt</Label>
            <Input id="goal-people" inputMode="numeric" value={form.people} onChange={(e) => setForm({ ...form, people: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-hours">Zeit pro Woche (h)</Label>
            <Input id="goal-hours" inputMode="numeric" value={form.hours} placeholder="z. B. 3" onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Was soll wachsen?</p>
          <div className="flex flex-wrap gap-2">
            {DIRECTIONS.map(([key, label]) => {
              const on = form.directions.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setForm({ ...form, directions: on ? form.directions.filter((d) => d !== key) : [...form.directions, key] })}
                  className={cn("rounded-full border px-3 py-1 text-sm", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="goal-share">
            Anteil Tierfutter: <span className="font-semibold">{form.animalShare} %</span>
          </Label>
          <input
            id="goal-share"
            type="range"
            min={0}
            max={100}
            step={10}
            value={form.animalShare}
            onChange={(e) => setForm({ ...form, animalShare: Number(e.target.value) })}
            className="w-full accent-[#2F6B3F]"
          />
          <p className="text-xs text-muted-foreground">0 % = alles für die Küche, 100 % = alles für die Tiere.</p>
        </div>
      </fieldset>
      {canWrite && (
        <Button type="submit" disabled={save.isPending} className="gap-1.5">
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Plan berechnen
        </Button>
      )}
    </form>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function Assistant({ farm }: { farm: FarmSummary }) {
  const goals = useGetGardenGoals(farm.id);
  const plan = useGetGardenPlan(farm.id);
  const catalog = useGetGardenCatalog();
  const canWrite = farm.role !== "guest";
  const name = (key: string) => catalog.data?.find((c) => c.key === key)?.name ?? key;
  if (!goals.data) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  const p = plan.data;

  return (
    <div className="space-y-5">
      <GoalsForm key={JSON.stringify(goals.data)} farm={farm} goals={goals.data} />
      {!p ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Tile label="Bedarf Küche" value={m2(p.kitchenNeedM2)} note={`${p.goals.people} ${p.goals.people === 1 ? "Person" : "Personen"} im Jahr`} />
            <Tile label="Bedarf Tierfutter" value={m2(p.fodder.needM2)} note={`${kg(p.fodder.perDayKg)} Grünes am Tag`} />
            <Tile label="Deine Beete" value={m2(p.availableM2)} note={`${m2(p.kitchenM2)} Küche · ${m2(p.fodderM2)} Futter`} />
            <Tile
              label="Abgedeckt"
              value={p.kitchenCoverage === null ? "–" : `${p.kitchenCoverage} %`}
              note={p.fodderCoverage === null ? "der Küche" : `Küche · Futter ${p.fodderCoverage} %`}
            />
          </div>
          {p.tips.map((tip) => (
            <HenniTip key={tip}>{tip}</HenniTip>
          ))}
          {p.fodder.animals.length > 0 && (
            <section className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
              <h2 className="font-semibold">Tiere aus „Meine Farm“</h2>
              <ul className="space-y-1">
                {p.fodder.animals.map((a) => (
                  <li key={a.species} className="flex justify-between gap-2">
                    <span>
                      {a.count} {SPECIES_DE[a.species]}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{a.perDayKg > 0 ? `${kg(a.perDayKg)} am Tag` : "kein Grünfutter aus dem Beet"}</span>
                  </li>
                ))}
              </ul>
              {(p.fodder.summerKg > 0 || p.fodder.winterKg > 0) && (
                <p className="text-xs text-muted-foreground">
                  Saison: etwa {kg(p.fodder.summerKg)} frisch · Winter: etwa {kg(p.fodder.winterKg)} Lagerfutter
                  {p.fodder.winterFromRations && " (aus den Winterrationen im Futterplaner)"}
                </p>
              )}
            </section>
          )}
          <section className="space-y-2">
            <h2 className="font-semibold">Aufteilung auf die Beete</h2>
            {p.beds.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Beete.</p>
            ) : (
              <ul className="space-y-2">
                {p.beds.map((b) => (
                  <li key={b.bedId} className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/beete/${farm.id}/${b.bedId}`} className="font-medium hover:underline">
                        {b.name}
                      </Link>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          b.role === "fodder" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-primary/10 text-primary",
                        )}
                      >
                        {b.role === "fodder" ? "Tierfutter" : "Küche"} · {m2(b.areaM2)}
                      </span>
                    </div>
                    <p className="text-muted-foreground">{b.crops.map(name).join(", ") || "–"}</p>
                    {canWrite && b.crops.length > 0 && (
                      <Button asChild size="sm" variant="outline" className="gap-1.5">
                        <Link href={`/beete/${farm.id}/${b.bedId}?ki=${encodeURIComponent(b.wishes)}&futter=${b.role === "fodder" ? 100 : 0}`}>
                          <Sparkles className="h-4 w-4" />
                          Mit KI bepflanzen
                        </Link>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {p.calculation.length > 0 && (
            <details className="rounded-xl border border-border bg-card p-3 text-sm" data-testid="garden-calculation">
              <summary className="cursor-pointer font-medium">So rechnet der Assistent</summary>
              <ul className="mt-2 space-y-1.5 text-muted-foreground">
                {p.calculation.map((line) => (
                  <li key={line} className="tabular-nums">{line}</li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-xs text-muted-foreground">
            Faustwerte: 40 m² Gemüse, 20 m² Lagergemüse, 2 m² Kräuter und 5 m² Obst pro Person und Jahr; Grünfutter 3 kg/m², Lagerfutter 4 kg/m²; etwa 1 Stunde pro Woche
            für 10 m². Die KI füllt nur die Beete – die festen Regeln prüfen jeden Vorschlag.
          </p>
        </>
      )}
    </div>
  );
}

/** /beete/assistent – Garten-Assistent: goals → needs → beds. */
export default function GartenAssistentPage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/beete" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Beete
      </Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Beet-Architekt</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          Garten-Assistent
          <PremiumBadge />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Was brauchen Haushalt und Tiere – und wie verteilst du es auf deine Beete?</p>
      </div>
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Assistant farm={farm} />}
    </div>
  );
}
