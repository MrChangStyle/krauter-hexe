import { useState, type FormEvent } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Coins, Loader2, Plus, Trash2, Zap } from "lucide-react";
import {
  getGetGrowAccessQueryKey,
  getGetGrowCostsQueryKey,
  getGetGrowOverviewQueryKey,
  useAddGrowCost,
  useDeleteGrowCost,
  useGetGrowAccess,
  useGetGrowCosts,
  useGetGrowOverview,
  useSetGrowSettings,
  useUpdateGrow,
  type Grow,
  type GrowCostCategory,
  type GrowCosts,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { todayIso } from "@/lib/farm-labels";
import { COST_CATEGORY_LABELS, ENVIRONMENT_LABELS, GROW_ENABLED } from "@/lib/grow-labels";
import { deDay } from "@/lib/medicine-labels";
import { euro, num } from "@/lib/yield-labels";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

const parse = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

/** Lamp, fans and the tariff – and what that makes in kWh and euros. */
function PowerCard({ grow, costs }: { grow: Grow; costs: GrowCosts }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [lamp, setLamp] = useState(String(grow.lightWatts ?? ""));
  const [fans, setFans] = useState(String(grow.fanWatts ?? ""));
  const [cents, setCents] = useState(num(Math.round(costs.kwhPrice * 1000) / 10));
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getGetGrowCostsQueryKey(grow.id) });
    void queryClient.invalidateQueries({ queryKey: getGetGrowOverviewQueryKey() });
  };
  const onError = (err: unknown) => toast({ title: "Nicht gespeichert", description: errorText(err, ""), variant: "destructive" });
  const updateGrow = useUpdateGrow({ mutation: { onError } });
  const settings = useSetGrowSettings({ mutation: { onError } });
  const e = costs.energy;
  const s = costs.summary;

  async function save(event: FormEvent) {
    event.preventDefault();
    const price = parse(cents);
    try {
      await updateGrow.mutateAsync({
        growId: grow.id,
        data: { name: grow.name, environment: grow.environment, medium: grow.medium, tentSize: grow.tentSize, lightType: grow.lightType, notes: grow.notes, lightWatts: parse(lamp), fanWatts: parse(fans) },
      });
      const access = await settings.mutateAsync({ data: { kwhPrice: price === null ? null : price / 100 } });
      queryClient.setQueryData(getGetGrowAccessQueryKey(), access);
      refresh();
      setEditing(false);
    } catch {
      // Shown by onError.
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="flex items-center gap-2 font-semibold">
        <Zap className="h-4 w-4 text-primary" />
        Strom
      </h2>
      {grow.environment !== "indoor" ? (
        <p className="text-muted-foreground">{ENVIRONMENT_LABELS[grow.environment]}: Die Sonne kostet nichts – hier zählen nur deine Ausgaben.</p>
      ) : editing ? (
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="k-lamp">Lampe (W)</Label>
              <Input id="k-lamp" type="number" min={1} max={5000} value={lamp} onChange={(ev) => setLamp(ev.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="k-fans">Lüfter/Filter (W)</Label>
              <Input id="k-fans" type="number" min={1} max={2000} value={fans} onChange={(ev) => setFans(ev.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="k-price">Cent/kWh</Label>
              <Input id="k-price" inputMode="decimal" value={cents} onChange={(ev) => setCents(ev.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Den Strompreis findest du auf deiner Stromrechnung (Arbeitspreis). Er gilt für alle deine Grows.</p>
          <Button type="submit" size="sm" disabled={updateGrow.isPending || settings.isPending}>
            Speichern
          </Button>
        </form>
      ) : (
        <>
          <p className="text-muted-foreground">
            Lampe {costs.lightWatts ? `${costs.lightWatts} W` : "–"} · Lüfter/Filter {costs.fanWatts ? `${costs.fanWatts} W` : "–"} ·{" "}
            {num(Math.round(costs.kwhPrice * 1000) / 10)} ct/kWh{costs.ownPrice ? "" : " (Durchschnitt)"}{" "}
            <button type="button" className="text-xs underline" onClick={() => setEditing(true)}>
              ändern
            </button>
          </p>
          {e.kwh === 0 ? (
            <p className="text-muted-foreground">Trag die Leistung von Lampe und Lüftern ein und leg Pflanzen an – dann rechnet die App den Strom nach dem Grow-Plan.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-muted/50 p-2">
                <dt className="text-xs text-muted-foreground">Bisher</dt>
                <dd className="font-semibold" data-testid="power-so-far">
                  {num(e.kwhSoFar)} kWh · {euro(s.electricitySoFarEur)}
                </dd>
              </div>
              <div className="rounded-lg bg-muted/50 p-2">
                <dt className="text-xs text-muted-foreground">Ganzer Grow</dt>
                <dd className="font-semibold" data-testid="power-total">
                  {num(e.kwh)} kWh · {euro(s.electricityEur)}
                </dd>
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                {e.from && e.to && `${deDay(e.from)} bis ${deDay(e.to)}: `}
                Lampe {num(e.kwhLamp)} kWh ({num(e.lampHours)} Stunden Licht nach Plan), Lüfter {num(e.kwhFans)} kWh rund um die Uhr.
              </p>
            </dl>
          )}
        </>
      )}
    </section>
  );
}

function CostForm({ growId }: { growId: number }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState<GrowCostCategory>("equipment");
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = useAddGrowCost({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getGetGrowCostsQueryKey(growId), data);
        setItem("");
        setAmount("");
        setError(null);
      },
      onError: (err) => setError(errorText(err, "Nicht gespeichert.")),
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate({ growId, data: { date, category, item: item.trim(), amount: Number(amount.replace(",", ".")) } });
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-date">Datum</Label>
          <Input id="c-date" type="date" required max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-cat">Kategorie</Label>
          <select id="c-cat" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as GrowCostCategory)}>
            {(Object.keys(COST_CATEGORY_LABELS) as GrowCostCategory[]).map((k) => (
              <option key={k} value={k}>
                {COST_CATEGORY_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-item">Was</Label>
          <Input id="c-item" required maxLength={80} placeholder="z. B. Zelt 80×80, Erde 50 l" value={item} onChange={(e) => setItem(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-amount">Euro</Label>
          <Input id="c-amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" className="gap-1.5" disabled={add.isPending}>
        <Plus className="h-4 w-4" />
        Eintragen
      </Button>
    </form>
  );
}

function Costs({ grow, costs }: { grow: Grow; costs: GrowCosts }) {
  const queryClient = useQueryClient();
  const remove = useDeleteGrowCost({ mutation: { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getGetGrowCostsQueryKey(grow.id) }) } });
  const s = costs.summary;
  return (
    <div className="space-y-5">
      <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm" data-testid="cost-summary">
        <h2 className="flex items-center gap-2 font-semibold">
          <Coins className="h-4 w-4 text-primary" />
          Kosten des Grows
        </h2>
        <p className="text-2xl font-bold">{euro(s.totalEur)}</p>
        <p className="text-muted-foreground">
          Strom {euro(s.electricityEur)}
          {s.byCategory.map((c) => ` · ${COST_CATEGORY_LABELS[c.category]} ${euro(c.eur)}`)}
        </p>
        {s.eurPerGram !== null ? (
          <p className="font-medium" data-testid="eur-per-gram">
            {euro(s.eurPerGram)} pro Gramm ({num(s.dryGrams)} g trocken geerntet, Strom bis heute)
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Nach der Ernte mit Trockengewicht steht hier der Preis pro Gramm.</p>
        )}
      </section>

      <PowerCard grow={grow} costs={costs} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Ausgaben</h2>
        <CostForm growId={grow.id} />
        {costs.items.length > 0 && (
          <ul className="divide-y divide-border text-sm">
            {costs.items.map((i) => (
              <li key={i.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{i.item}</span>
                  <span className="block text-xs text-muted-foreground">
                    {deDay(i.date)} · {COST_CATEGORY_LABELS[i.category]}
                  </span>
                </span>
                <span className="tabular-nums">{euro(i.amount)}</span>
                <button type="button" aria-label="Ausgabe löschen" className="text-muted-foreground hover:text-destructive" onClick={() => remove.mutate({ costId: i.id })}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Nur für dich – diese Zahlen erscheinen nicht in „Ertrag & Bilanz“ des Hofs.</p>
      </section>
    </div>
  );
}

/** /grow/kosten/:growId – Strom- und Kostenrechner of one grow. */
export default function GrowKostenPage() {
  const params = useParams<{ growId: string }>();
  const growId = Number(params.growId);
  const access = useGetGrowAccess({ query: { queryKey: getGetGrowAccessQueryKey(), enabled: GROW_ENABLED } });
  const ready = GROW_ENABLED && !!access.data?.ageConfirmed;
  const overview = useGetGrowOverview({ query: { queryKey: getGetGrowOverviewQueryKey(), enabled: ready } });
  const costs = useGetGrowCosts(growId, { query: { queryKey: getGetGrowCostsQueryKey(growId), enabled: ready } });
  const grow = overview.data?.grows.find((g) => g.id === growId);
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/grow" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Grow
      </Link>
      {!ready && !access.isLoading ? (
        <p className="text-sm text-muted-foreground">Bitte bestätige zuerst auf der Grow-Seite, dass du volljährig bist.</p>
      ) : !grow || !costs.data ? (
        overview.isLoading || costs.isLoading || access.isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : (
          <p className="text-sm text-muted-foreground">Diesen Grow gibt es nicht (mehr).</p>
        )
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold">Strom &amp; Kosten</h1>
            <p className="text-sm text-muted-foreground">
              {grow.name} · {ENVIRONMENT_LABELS[grow.environment]}
            </p>
          </div>
          <Costs grow={grow} costs={costs.data} />
        </>
      )}
    </div>
  );
}
