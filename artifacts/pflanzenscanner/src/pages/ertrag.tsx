import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Egg, Loader2, PiggyBank, Plus, Tag, Trash2 } from "lucide-react";
import {
  getGetYieldOverviewQueryKey,
  getListFarmPricesQueryKey,
  useAddYield,
  useDeleteYield,
  useEnsureOwnFarm,
  useGetYieldOverview,
  useListFarmPrices,
  useListHerds,
  useSetFarmPrice,
  type FarmProduct,
  type FarmSummary,
  type PriceItem,
  type YieldMonth,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { todayIso } from "@/lib/farm-labels";
import { deDay } from "@/lib/medicine-labels";
import { MONTHS, PRODUCTS, changeText, euro, num } from "@/lib/yield-labels";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

/** Quick entry: "heute 5 Eier". */
function EntryForm({ farm, year }: { farm: FarmSummary; year: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const herds = useListHerds(farm.id).data ?? [];
  const [product, setProduct] = useState<FarmProduct>("eggs");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [herdId, setHerdId] = useState("");
  const add = useAddYield({
    mutation: {
      onSuccess() {
        void queryClient.invalidateQueries({ queryKey: getGetYieldOverviewQueryKey(farm.id, year) });
        toast({ title: `${amount} ${PRODUCTS[product].unit} ${PRODUCTS[product].label} eingetragen` });
        setAmount("");
      },
      onError: (err) => toast({ title: "Nicht eingetragen", description: errorText(err, ""), variant: "destructive" }),
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate({ farmId: farm.id, data: { product, amount: Number(amount.replace(",", ".")), date, herdId: herdId ? Number(herdId) : null } });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="flex items-center gap-2 font-semibold">
        <Egg className="h-4 w-4 text-primary" />
        Eintragen
      </h2>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="y-product">Was</Label>
          <select id="y-product" className={selectClass} value={product} onChange={(e) => setProduct(e.target.value as FarmProduct)}>
            {(Object.keys(PRODUCTS) as FarmProduct[]).map((p) => (
              <option key={p} value={p}>
                {PRODUCTS[p].label} ({PRODUCTS[p].unit})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="y-amount">Menge</Label>
          <Input id="y-amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="y-date">Datum</Label>
          <Input id="y-date" type="date" max={todayIso()} required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="y-herd">Gruppe</Label>
          <select id="y-herd" className={selectClass} value={herdId} onChange={(e) => setHerdId(e.target.value)}>
            <option value="">Ganzer Hof</option>
            {herds.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button type="submit" size="sm" disabled={add.isPending} className="gap-1.5">
        {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Eintragen
      </Button>
    </form>
  );
}

function MonthChart({ months }: { months: YieldMonth[] }) {
  const data = months.map((m) => ({ name: MONTHS[m.month - 1], value: Math.round((m.garden + m.animals) * 100) / 100, garden: m.garden, animals: m.animals }));
  if (data.every((d) => d.value === 0)) return null;
  return (
    <div className="h-44 w-full" role="img" aria-label="Wert der Erträge je Monat">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="0" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval={0} />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `${v.toLocaleString("de-DE")} €`} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
              if (!p) return null;
              return (
                <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm">
                  <div className="font-medium">
                    {p.name}: {euro(p.value)}
                  </div>
                  <div className="text-muted-foreground">
                    Garten {euro(p.garden)} · Tiere {euro(p.animals)}
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PricesDialog({ farm, year, onClose }: { farm: FarmSummary; year: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const prices = useListFarmPrices(farm.id);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const set = useSetFarmPrice({
    mutation: {
      onSuccess(list) {
        queryClient.setQueryData(getListFarmPricesQueryKey(farm.id), list);
        void queryClient.invalidateQueries({ queryKey: getGetYieldOverviewQueryKey(farm.id, year) });
      },
      onError: (err) => toast({ title: "Nicht gespeichert", description: errorText(err, ""), variant: "destructive" }),
    },
  });

  function save(p: PriceItem) {
    const raw = draft[p.key];
    if (raw === undefined) return;
    const eur = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    if (eur !== null && Number.isNaN(eur)) return;
    set.mutate({ farmId: farm.id, data: { key: p.key, eur } });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preise</DialogTitle>
          <DialogDescription>Was ihr im Laden oder Hofladen zahlen würdet. Leer lassen für den vorgeschlagenen Preis.</DialogDescription>
        </DialogHeader>
        {!prices.data ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <ul className="space-y-2 text-sm">
            {prices.data.map((p) => (
              <li key={p.key} className="flex items-center gap-2">
                <label htmlFor={`price-${p.key}`} className="min-w-0 flex-1">
                  {p.label} <span className="text-xs text-muted-foreground">€/{p.unit}</span>
                </label>
                <Input
                  id={`price-${p.key}`}
                  className="w-24"
                  inputMode="decimal"
                  placeholder={num(p.eur)}
                  value={draft[p.key] ?? (p.own ? num(p.eur) : "")}
                  onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))}
                  onBlur={() => save(p)}
                />
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Overview({ farm }: { farm: FarmSummary }) {
  const thisYear = Number(todayIso().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [pricing, setPricing] = useState(false);
  const queryClient = useQueryClient();
  const overview = useGetYieldOverview(farm.id, year);
  const remove = useDeleteYield({ mutation: { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getGetYieldOverviewQueryKey(farm.id, year) }) } });
  const canWrite = farm.role !== "guest";
  const d = overview.data;
  const change = d ? changeText(d.summary.total, d.previousTotal) : null;

  return (
    <div className="space-y-5">
      {canWrite && year === thisYear && <EntryForm farm={farm} year={year} />}

      <div className="flex items-center justify-between gap-2">
        <select aria-label="Jahr" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[0, 1, 2, 3].map((k) => (
            <option key={k} value={thisYear - k}>
              {thisYear - k}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPricing(true)}>
          <Tag className="h-4 w-4" />
          Preise
        </Button>
      </div>

      {!d ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : (
        <>
          <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">Wert {year}</h2>
              <span className="text-2xl font-bold" data-testid="yield-total">
                {euro(d.summary.total)}
              </span>
            </div>
            {change && <p className="text-xs text-muted-foreground">{change}</p>}
            <MonthChart months={d.summary.months} />
            <p className="text-xs text-muted-foreground">Garten {euro(d.summary.garden.value)} · Tiere {euro(d.summary.animals.value)} – zu euren Preisen.</p>
          </section>

          {(d.laying || d.feedCost) && (
            <section className="grid grid-cols-2 gap-3 text-sm">
              {d.laying && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Legeleistung (30 Tage)</p>
                  <p className="text-lg font-semibold">{num(d.laying.perHenDay)} Eier</p>
                  <p className="text-xs text-muted-foreground">
                    je Henne und Tag · {d.laying.hens} Hennen
                  </p>
                </div>
              )}
              {d.feedCost && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Futterkosten</p>
                  <p className="text-lg font-semibold">{euro(d.feedCost.perMonth)}</p>
                  <p className="text-xs text-muted-foreground">
                    im Monat, nach den Rationen{d.feedCost.complete ? "" : " (nicht alle Preise bekannt)"}
                  </p>
                </div>
              )}
            </section>
          )}

          {d.summary.animals.lines.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tiere</h2>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {d.summary.animals.lines.map((l) => (
                    <tr key={l.product}>
                      <td className="py-1.5">{PRODUCTS[l.product].label}</td>
                      <td className="py-1.5 text-right">
                        {num(l.amount)} {l.unit}
                      </td>
                      <td className="py-1.5 text-right font-medium">{euro(l.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Garten</h2>
            {d.summary.garden.lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Ernte {year}. Ernten tragt ihr am Beet ein –{" "}
                <Link href="/beete" className="underline">
                  zu den Beeten
                </Link>
                .
              </p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {d.summary.garden.lines.map((l) => (
                    <tr key={l.key}>
                      <td className="py-1.5">
                        {l.name}
                        {l.fodderKg > 0 && <span className="block text-xs text-muted-foreground">davon {num(l.fodderKg)} kg als Futter</span>}
                      </td>
                      <td className="py-1.5 text-right">{num(l.kitchenKg + l.fodderKg)} kg</td>
                      <td className="py-1.5 text-right font-medium">{euro(l.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {d.entries.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Einträge {year} ({d.entries.length})</summary>
              <ul className="divide-y divide-border pt-2">
                {d.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 py-1.5">
                    <span className="flex-1">
                      {deDay(e.date)} · {num(e.amount)} {e.unit} {PRODUCTS[e.product].label}
                      {e.herdName && <span className="text-muted-foreground"> · {e.herdName}</span>}
                    </span>
                    {canWrite && (
                      <button type="button" aria-label="Eintrag löschen" className="text-muted-foreground hover:text-destructive" onClick={() => remove.mutate({ farmId: farm.id, yieldId: e.id })}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {pricing && <PricesDialog farm={farm} year={year} onClose={() => setPricing(false)} />}
    </div>
  );
}

/** /farm/ertrag – eggs, milk & co., the garden's harvests and what it is all worth. */
export default function ErtragPage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/farm" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Tiere
      </Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Meine Farm</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <PiggyBank className="h-6 w-6 text-primary" />
          Ertrag & Bilanz
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Was Tiere und Garten im Jahr bringen – und was es im Laden kosten würde.</p>
      </div>
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Overview farm={farm} />}
    </div>
  );
}
