import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, ChevronRight, Lock, Plus, Scale, ShieldCheck, Sprout, Trash2, Archive, Loader2 } from "lucide-react";
import {
  getGetGrowAccessQueryKey,
  getGetGrowOverviewQueryKey,
  useAddGrowPlant,
  useConfirmGrowAge,
  useCreateGrow,
  useDeleteGrow,
  useGetGrowAccess,
  useGetGrowOverview,
  useSetGrowAdults,
  useUpdateGrow,
  type Grow,
  type GrowAccess,
  type GrowEnvironment,
  type GrowMedium,
  type GrowOverview,
} from "@workspace/api-client-react";
import { GrowPlantDialog } from "@/components/grow-plant-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ENVIRONMENT_LABELS, GROW_ENABLED, MEDIUM_LABELS, PHASE_COLORS, PHASE_LABELS, STRAIN_TYPE_LABELS, FLOWERING_LABELS, dayText } from "@/lib/grow-labels";
import { deDay } from "@/lib/medicine-labels";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

function Header() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">Zusatzmodul · ab 18</p>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Sprout className="h-6 w-6 text-primary" />
        Grow
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Eigenanbau für Erwachsene im Rahmen des Konsumcannabisgesetzes: Grow-Plan, Pflege und Tagebuch für Zelt, Garten und Gewächshaus. Keine Rechts- und keine Konsumberatung.
      </p>
    </div>
  );
}

/** The account confirms its age and the adults in the household. */
function AgeGate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [adult, setAdult] = useState(false);
  const [adults, setAdults] = useState("1");
  const confirm = useConfirmGrowAge({
    mutation: {
      onSuccess: (data) => queryClient.setQueryData(getGetGrowAccessQueryKey(), data),
      onError: (err) => toast({ title: "Nicht gespeichert", description: errorText(err, ""), variant: "destructive" }),
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    confirm.mutate({ data: { adults: Number(adults) } });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="h-4 w-4 text-primary" />
        Bevor es losgeht
      </h2>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>Anbau und Besitz sind nur Erwachsenen erlaubt.</li>
        <li>Pflanzen und Ernte müssen vor Kindern, Jugendlichen und Dritten gesichert sein.</li>
        <li>Die App gibt gärtnerische Tipps – keine Rechtsberatung und keine Empfehlung zum Konsum.</li>
      </ul>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
        <span>Ich bin mindestens 18 Jahre alt.</span>
      </label>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="grow-adults">Erwachsene im Haushalt</Label>
        <Input id="grow-adults" type="number" min={1} max={10} required className="w-24" value={adults} onChange={(e) => setAdults(e.target.value)} />
        <span className="text-xs text-muted-foreground">Erlaubt sind 3 Pflanzen pro erwachsener Person – die App rechnet damit.</span>
      </div>
      <Button type="submit" disabled={!adult || confirm.isPending}>
        {confirm.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Bestätigen
      </Button>
    </form>
  );
}

function KcangCard({ overview, access }: { overview: GrowOverview; access: GrowAccess }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [adults, setAdults] = useState(String(access.adults));
  const save = useSetGrowAdults({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getGetGrowAccessQueryKey(), data);
        void queryClient.invalidateQueries({ queryKey: getGetGrowOverviewQueryKey() });
        setEditing(false);
      },
    },
  });
  const k = overview.kcang;
  const warn = k.plantsOver || k.gramsOver;
  return (
    <section className={`space-y-2 rounded-xl border p-4 text-sm ${warn ? "border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100" : "border-border bg-card"}`}>
      <h2 className="flex items-center gap-2 font-semibold">
        {warn ? <AlertTriangle className="h-4 w-4" /> : <Scale className="h-4 w-4 text-primary" />}
        KCanG-Check
      </h2>
      <p>
        <span className="font-semibold" data-testid="kcang-plants">
          {k.activePlants} von {k.maxPlants} Pflanzen
        </span>{" "}
        gleichzeitig ({access.adults} {access.adults === 1 ? "Erwachsener" : "Erwachsene"} im Haushalt).
      </p>
      {k.plantsOver && <p className="font-medium">Mehr Pflanzen als erlaubt – bitte reduzieren.</p>}
      {k.dryGramsLastYear > 0 && (
        <p>
          Ernte der letzten 12 Monate: {k.dryGramsLastYear} g trocken. Zu Hause erlaubt sind bis zu {k.maxGrams} g.
          {k.gramsOver && " Mehr als erlaubt, falls noch alles vorhanden ist."}
        </p>
      )}
      {editing ? (
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kc-adults">Erwachsene</Label>
            <Input id="kc-adults" type="number" min={1} max={10} className="w-20" value={adults} onChange={(e) => setAdults(e.target.value)} />
          </div>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ data: { adults: Number(adults) } })}>
            Speichern
          </Button>
        </div>
      ) : (
        <button type="button" className="text-xs underline" onClick={() => setEditing(true)}>
          Erwachsene im Haushalt ändern
        </button>
      )}
    </section>
  );
}

function NewGrowDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<GrowEnvironment>("indoor");
  const [medium, setMedium] = useState<GrowMedium>("soil");
  const [tentSize, setTentSize] = useState("");
  const [lightType, setLightType] = useState("LED");
  const [watts, setWatts] = useState("");
  const create = useCreateGrow({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getGetGrowOverviewQueryKey(), data);
        onClose();
      },
      onError: (err) => toast({ title: "Nicht angelegt", description: errorText(err, ""), variant: "destructive" }),
    },
  });
  const indoor = environment === "indoor";

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate({
      data: {
        name: name.trim(),
        environment,
        medium,
        tentSize: indoor ? tentSize.trim() || null : null,
        lightType: indoor ? lightType.trim() || null : null,
        lightWatts: indoor && watts ? Number(watts) : null,
      },
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !create.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grow anlegen</DialogTitle>
          <DialogDescription>Ein Zelt, ein Platz im Garten oder ein Gewächshaus.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-name">Name</Label>
            <Input id="g-name" maxLength={60} required value={name} placeholder="z. B. Zelt Keller" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="g-env">Wo</Label>
              <select id="g-env" className={selectClass} value={environment} onChange={(e) => setEnvironment(e.target.value as GrowEnvironment)}>
                {(Object.keys(ENVIRONMENT_LABELS) as GrowEnvironment[]).map((k) => (
                  <option key={k} value={k}>
                    {ENVIRONMENT_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="g-medium">Substrat</Label>
              <select id="g-medium" className={selectClass} value={medium} onChange={(e) => setMedium(e.target.value as GrowMedium)}>
                {(Object.keys(MEDIUM_LABELS) as GrowMedium[]).map((k) => (
                  <option key={k} value={k}>
                    {MEDIUM_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {indoor && (
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="g-tent">Zelt (cm)</Label>
                <Input id="g-tent" maxLength={30} value={tentSize} placeholder="80×80×160" onChange={(e) => setTentSize(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="g-light">Lampe</Label>
                <Input id="g-light" maxLength={30} value={lightType} onChange={(e) => setLightType(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="g-watts">Watt</Label>
                <Input id="g-watts" type="number" min={1} max={5000} value={watts} onChange={(e) => setWatts(e.target.value)} />
              </div>
            </div>
          )}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Anlegen
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GrowCard({ grow }: { grow: Grow }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: getGetGrowOverviewQueryKey() });
  const add = useAddGrowPlant({
    mutation: {
      onSuccess() {
        refresh();
        setAdding(false);
      },
      onError: (err) => toast({ title: "Nicht angelegt", description: errorText(err, ""), variant: "destructive" }),
    },
  });
  const update = useUpdateGrow({ mutation: { onSuccess: (data) => queryClient.setQueryData(getGetGrowOverviewQueryKey(), data) } });
  const remove = useDeleteGrow({ mutation: { onSuccess: refresh } });
  const growInput = { name: grow.name, environment: grow.environment, medium: grow.medium, tentSize: grow.tentSize, lightType: grow.lightType, lightWatts: grow.lightWatts, notes: grow.notes };

  return (
    <section className={`space-y-3 rounded-xl border border-border bg-card p-4 text-sm ${grow.archived ? "opacity-60" : ""}`} data-testid={`grow-${grow.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{grow.name}</h2>
          <p className="text-xs text-muted-foreground">
            {ENVIRONMENT_LABELS[grow.environment]} · {MEDIUM_LABELS[grow.medium]}
            {grow.tentSize && ` · ${grow.tentSize}`}
            {grow.lightWatts && ` · ${grow.lightType ?? "Lampe"} ${grow.lightWatts} W`}
          </p>
        </div>
        <div className="flex gap-1">
          <button type="button" aria-label={grow.archived ? "Wieder aktiv" : "Archivieren"} className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => update.mutate({ growId: grow.id, data: { ...growInput, archived: !grow.archived } })}>
            <Archive className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Grow löschen"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
            onClick={() => window.confirm(`„${grow.name}“ mit allen Pflanzen und Einträgen löschen?`) && remove.mutate({ growId: grow.id })}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {grow.plants.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Pflanze.</p>
      ) : (
        <ul className="divide-y divide-border">
          {grow.plants.map((p) => {
            const next = p.plan.steps.find((s) => !s.past);
            return (
              <li key={p.id}>
                <Link href={`/grow/pflanze/${p.id}`} className="flex items-center gap-3 py-2.5">
                  <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: PHASE_COLORS[p.plan.current] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {p.name}
                      {p.strain && <span className="font-normal text-muted-foreground"> · {p.strain}</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {PHASE_LABELS[p.plan.current]} · {dayText(p.plan.day)} · {STRAIN_TYPE_LABELS[p.strainType]}, {FLOWERING_LABELS[p.flowering]}
                    </span>
                    {next && (
                      <span className="block text-xs">
                        {deDay(next.on)}: {next.text}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {!grow.archived && (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          Pflanze
        </Button>
      )}
      {adding && <GrowPlantDialog plant={null} busy={add.isPending} onSubmit={(data) => add.mutate({ growId: grow.id, data })} onClose={() => setAdding(false)} />}
    </section>
  );
}

function Overview({ access }: { access: GrowAccess }) {
  const overview = useGetGrowOverview();
  const [creating, setCreating] = useState(false);
  if (!overview.data) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  const d = overview.data;
  return (
    <div className="space-y-4">
      <KcangCard overview={d} access={access} />
      <div className="grid grid-cols-2 gap-3">
        <Link href="/grow/wissen" className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm font-medium hover:bg-muted/50">
          <BookOpen className="h-4 w-4 text-primary" />
          Grow-Wissen
        </Link>
        <Link href="/grow/recht" className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm font-medium hover:bg-muted/50">
          <Scale className="h-4 w-4 text-primary" />
          Rechtliches
        </Link>
      </div>
      <Button className="gap-1.5" onClick={() => setCreating(true)}>
        <Plus className="h-4 w-4" />
        Grow anlegen
      </Button>
      {d.grows.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Leg zuerst einen Grow an – ein Zelt, einen Platz im Garten oder ein Gewächshaus – und dann die Pflanzen darin. Die App plant jede Phase von der Keimung bis zum Curing.
        </p>
      )}
      {d.grows.map((g) => (
        <GrowCard key={g.id} grow={g} />
      ))}
      {creating && <NewGrowDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

/** /grow – the Grow module: gate, KCanG check, grows and plants. */
export default function GrowPage() {
  const access = useGetGrowAccess({ query: { queryKey: getGetGrowAccessQueryKey(), enabled: GROW_ENABLED } });
  const a = access.data;
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Header />
      {!GROW_ENABLED ? (
        <p className="text-sm text-muted-foreground">Dieses Modul ist in dieser Version nicht verfügbar.</p>
      ) : !a ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : !a.unlocked ? (
        <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
          <h2 className="flex items-center gap-2 font-semibold">
            <Lock className="h-4 w-4 text-primary" />
            Zusatzmodul
          </h2>
          <p className="text-muted-foreground">Grow ist ein Zusatzmodul, das für dein Konto freigeschaltet werden muss.</p>
        </section>
      ) : !a.ageConfirmed ? (
        <AgeGate />
      ) : (
        <Overview access={a} />
      )}
    </div>
  );
}
