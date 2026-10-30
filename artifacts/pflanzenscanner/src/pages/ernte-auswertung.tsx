import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Award, Loader2 } from "lucide-react";
import { useEnsureOwnFarm, useGetHarvestReport, type FarmSummary, type HarvestReport } from "@workspace/api-client-react";
import { GardenEconomicsSection } from "@/components/garden-economics";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { MONTHS, changeText, euro, num } from "@/lib/yield-labels";
import { PageHeader } from "@/components/page-header";
import { OrganicAreaSwitch } from "@/components/organic-area-switch";

function Chart({ data, label, unit }: { data: { name: string; value: number }[]; label: string; unit: string }) {
  if (data.every((d) => d.value === 0)) return null;
  return (
    <div className="h-40 w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="0" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval={0} />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={36} tickFormatter={(v: number) => v.toLocaleString("de-DE")} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as { name: string; value: number } | undefined) : undefined;
              return p ? (
                <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm">
                  {p.name}: {num(p.value)} {unit}
                </div>
              ) : null;
            }}
          />
          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Report({ r }: { r: HarvestReport }) {
  if (r.crops.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        In dieser Saison ist noch nichts geerntet. Ernten tragt ihr am Beet bei der Pflanzung ein –{" "}
        <Link href="/beete" className="underline">
          zu den Beeten
        </Link>
        .
      </p>
    );
  }
  const change = r.previous ? changeText(r.kg, r.previous.kg) : null;
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Geerntet</p>
          <p className="text-lg font-semibold" data-testid="report-kg">{num(r.kg)} kg</p>
          <p className="text-xs text-muted-foreground">{change ?? (r.fodderKg > 0 ? `davon ${num(r.fodderKg)} kg Futter` : "erste Saison mit Ernten")}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Wert im Laden</p>
          <p className="text-lg font-semibold">{euro(r.value)}</p>
          <p className="text-xs text-muted-foreground">nach euren Preisen unter Ertrag</p>
        </div>
      </section>

      {r.best.length > 0 && (
        <section className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
          <h2 className="flex items-center gap-2 font-semibold">
            <Award className="h-4 w-4 text-primary" />
            Hat sich gelohnt
          </h2>
          <ol className="space-y-1">
            {r.best.map((b, i) => (
              <li key={b.label} className="flex justify-between">
                <span>
                  {i + 1}. {b.label}
                </span>
                <span className="font-medium">{euro(b.valuePerM2)} je m²</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">Ladenwert je m² der abgeernteten Fläche.</p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Je Monat (kg)</h2>
        <Chart data={r.months.map((v, i) => ({ name: MONTHS[i]!, value: v }))} label="Ernte je Monat in kg" unit="kg" />
      </section>

      {r.years.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Saisons im Vergleich (kg)</h2>
          <Chart data={r.years.map((y) => ({ name: String(y.season), value: y.kg }))} label="Ernte je Saison in kg" unit="kg" />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Je Kultur</h2>
        <ul className="divide-y divide-border text-sm" data-testid="report-crops">
          {r.crops.map((c) => (
            <li key={c.key} className="py-2">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{c.label}</span>
                <span className="font-medium">{euro(c.value)}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
                <span>
                  {num(c.kg)} kg{c.fodderKg > 0 ? ` (${num(c.fodderKg)} kg Futter)` : ""}
                  {c.kgPerM2 !== null ? ` · ${num(c.kgPerM2)} kg/m²` : ""}
                </span>
                <span>{c.previousKg !== null ? `Vorjahr ${num(c.previousKg)} kg` : c.beds.join(", ")}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Je Beet</h2>
        <ul className="divide-y divide-border text-sm">
          {r.beds.map((b) => (
            <li key={b.bedId ?? "none"} className="py-2">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{b.name}</span>
                <span className="font-medium">{euro(b.value)}</span>
              </div>
              <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                <span className="truncate">{b.crops.join(", ")}</span>
                <span className="shrink-0">
                  {num(b.kg)} kg{b.valuePerM2 !== null ? ` · ${euro(b.valuePerM2)}/m²` : ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Season({ farm }: { farm: FarmSummary }) {
  const [season, setSeason] = useState(new Date().getFullYear());
  const report = useGetHarvestReport(farm.id, season);
  const seasons = report.data?.seasons ?? [season];
  return (
    <div className="space-y-5">
      <select
        aria-label="Saison"
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        value={season}
        onChange={(e) => setSeason(Number(e.target.value))}
      >
        {seasons.map((s) => (
          <option key={s} value={s}>
            Saison {s}
          </option>
        ))}
      </select>
      {report.isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : report.data ? (
        <>
          <Report r={report.data} />
          <GardenEconomicsSection farm={farm} season={season} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Die Auswertung lässt sich gerade nicht laden.</p>
      )}
    </div>
  );
}

/** /beete/ernte – Ernte-Auswertung per crop and bed (docs/ernte-auswertung.md). */
export default function ErnteAuswertungPage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="ernte" subtitle="Was jede Kultur und jedes Beet gebracht hat, was der Garten gekostet hat – und was sich gelohnt hat." />
      <OrganicAreaSwitch area="garden" />
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Season farm={farm} />}
    </div>
  );
}
