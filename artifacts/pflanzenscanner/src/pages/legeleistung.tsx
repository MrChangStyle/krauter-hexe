import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowLeft, Egg, Info, Loader2 } from "lucide-react";
import { useEnsureOwnFarm, useGetLayingHistory, type FarmSummary, type LayingHint, type LayingWeek } from "@workspace/api-client-react";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { deDay } from "@/lib/medicine-labels";
import { num } from "@/lib/yield-labels";

/** "1 Ei", "12 Eier" */
function eggs(n: number): string {
  return `${num(n)} ${n === 1 ? "Ei" : "Eier"}`;
}

/** "14.10." */
function shortDay(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
}

function WeekChart({ weeks }: { weeks: LayingWeek[] }) {
  const data = weeks.map((w) => ({ name: shortDay(w.start), value: w.perHenDay ?? 0, week: w }));
  return (
    <div className="h-48 w-full" role="img" aria-label="Eier je Henne und Tag, Woche für Woche">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="0" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval={3} />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={36}
            domain={[0, (max: number) => Math.max(1, Math.ceil(max * 10) / 10)]}
            tickFormatter={(v: number) => v.toLocaleString("de-DE")}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
              if (!p) return null;
              const w = p.week;
              return (
                <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm">
                  <div className="font-medium">Woche ab {deDay(w.start)}</div>
                  <div>
                    {eggs(w.eggs)} · {w.hens} Hennen{w.days < 7 ? ` · ${w.days} Tage` : ""}
                  </div>
                  <div>{w.perHenDay === null ? "keine Hennen" : `${num(w.perHenDay)} je Henne und Tag`}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Hint({ hint }: { hint: LayingHint }) {
  const warn = hint.kind === "drop" || hint.kind === "quiet";
  return (
    <li
      className={`flex gap-3 rounded-xl border p-3 text-sm ${
        warn ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40" : "border-border bg-card"
      }`}
    >
      {warn ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      ) : (
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      )}
      <div>
        <p className="font-medium">{hint.title}</p>
        <p className="text-muted-foreground">{hint.text}</p>
      </div>
    </li>
  );
}

function History({ farm }: { farm: FarmSummary }) {
  const history = useGetLayingHistory(farm.id);
  const h = history.data;
  if (history.isLoading) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  if (!h) return <p className="text-sm text-muted-foreground">Der Verlauf lässt sich gerade nicht laden.</p>;
  const hasEggs = h.weeks.some((w) => w.eggs > 0);

  return (
    <div className="space-y-5">
      {h.hints.length > 0 && (
        <ul className="space-y-2" aria-label="Hinweise">
          {h.hints.map((hint) => (
            <Hint key={hint.kind} hint={hint} />
          ))}
        </ul>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Eier je Henne und Tag</h2>
        {hasEggs ? (
          <WeekChart weeks={h.weeks} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Noch keine Eier im letzten halben Jahr.{" "}
            <Link href="/farm/ertrag" className="underline">
              Eier eintragen
            </Link>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Gezählt werden Hennen ab etwa 20 Wochen. Gute Legehybriden schaffen bis zu 0,9, Rassehühner oft 0,4–0,6.
        </p>
      </section>

      {h.groups.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Gruppen (30 Tage)</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {h.groups.map((g) => (
                <tr key={g.herdId}>
                  <td className="py-1.5">
                    {g.name}
                    <span className="block text-xs text-muted-foreground">
                      {g.hens} Hennen · {eggs(g.eggs)}
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-medium">{g.perHenDay === null ? "–" : `${num(g.perHenDay)} je Henne/Tag`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Einzelne Hennen (30 Tage)</h2>
        {h.hens.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Wer wissen will, welche Henne legt: beim Eintragen der Eier die Henne auswählen.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {h.hens.map((hen) => (
                <tr key={hen.animalId}>
                  <td className="py-1.5">
                    <Link href={`/farm/${farm.id}/tier/${hen.animalId}`} className="hover:underline">
                      {hen.name}
                    </Link>
                  </td>
                  <td className="py-1.5 text-right">{eggs(hen.eggs)}</td>
                  <td className="py-1.5 text-right text-xs text-muted-foreground">{hen.lastEgg ? `zuletzt ${deDay(hen.lastEgg)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/** /farm/legeleistung – eggs per hen and day as a history (docs/legeleistung.md). */
export default function LegeleistungPage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/farm/ertrag" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Ertrag & Bilanz
      </Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Meine Farm</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Egg className="h-6 w-6 text-primary" />
          Legeleistung
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Wie viele Eier eure Hennen legen – Woche für Woche, je Gruppe und je Henne.</p>
      </div>
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <History farm={farm} />}
    </div>
  );
}
