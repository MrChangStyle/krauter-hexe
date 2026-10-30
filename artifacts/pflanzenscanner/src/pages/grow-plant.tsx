import { useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Circle, Info, Loader2, NotebookPen, Pencil, Thermometer, Trash2 } from "lucide-react";
import {
  getGetGrowOverviewQueryKey,
  getGetGrowPlantQueryKey,
  useAddGrowLog,
  useDeleteGrowLog,
  useDeleteGrowPlant,
  useGetGrowPlant,
  useUpdateGrowPlant,
  type GrowPlan,
  type GrowPlantDetail,
} from "@workspace/api-client-react";
import { GrowCheckSection } from "@/components/grow-check";
import { GrowPlantDialog } from "@/components/grow-plant-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { todayIso } from "@/lib/farm-labels";
import { ENVIRONMENT_LABELS, FLOWERING_LABELS, MEDIUM_LABELS, PHASE_COLORS, PHASE_LABELS, SEED_SEX_LABELS, STRAIN_TYPE_LABELS, dayText, rangeText } from "@/lib/grow-labels";
import { deDay } from "@/lib/medicine-labels";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

/** The phases as one bar, with the dates as a list (readable without colour). */
function Timeline({ plan }: { plan: GrowPlan }) {
  const day = (d: string) => new Date(`${d}T12:00:00Z`).getTime();
  const start = day(plan.phases[0]!.from);
  const end = day(plan.phases.at(-1)!.to) + 86_400_000;
  const today = day(todayIso());
  const pos = Math.min(100, Math.max(0, ((today - start) / (end - start)) * 100));
  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
          {plan.phases.map((p) => (
            <div key={p.key} title={PHASE_LABELS[p.key]} style={{ flexGrow: day(p.to) - day(p.from) + 86_400_000, background: PHASE_COLORS[p.key] }} />
          ))}
        </div>
        <div className="absolute -top-1 h-5 w-0.5 rounded bg-foreground" style={{ left: `${pos}%` }} aria-hidden />
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {plan.phases.map((p) => (
          <li key={p.key} className={`flex items-center gap-1.5 ${plan.current === p.key ? "font-semibold" : "text-muted-foreground"}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PHASE_COLORS[p.key] }} />
            {PHASE_LABELS[p.key]} {deDay(p.from).slice(0, 6)}–{deDay(p.to).slice(0, 6)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Targets({ plan }: { plan: GrowPlan }) {
  const t = plan.targets;
  const rows: [string, string | null][] = [
    ["Licht", t.light],
    ["Temperatur", rangeText(t.tempC, "°C")],
    ["Luftfeuchte", rangeText(t.humidity, "%")],
    ["VPD", rangeText(t.vpd, "kPa")],
    ["pH-Wert", rangeText(t.ph)],
    ["EC", rangeText(t.ec, "mS/cm")],
    ["Düngen", t.feeding],
    ["Gießen", t.watering],
  ];
  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
      <h2 className="flex items-center gap-2 font-semibold">
        <Thermometer className="h-4 w-4 text-primary" />
        Jetzt: {PHASE_LABELS[plan.current]}
      </h2>
      <dl className="divide-y divide-border">
        {rows
          .filter(([, v]) => v && v !== "—")
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-1.5">
              <dt className="shrink-0 text-muted-foreground">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

function LogForm({ detail }: { detail: GrowPlantDetail }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [date, setDate] = useState(todayIso());
  const [height, setHeight] = useState("");
  const [water, setWater] = useState("");
  const [ph, setPh] = useState("");
  const [ec, setEc] = useState("");
  const [note, setNote] = useState("");
  const add = useAddGrowLog({
    mutation: {
      onSuccess() {
        void queryClient.invalidateQueries({ queryKey: getGetGrowPlantQueryKey(detail.plant.id) });
        setHeight("");
        setWater("");
        setPh("");
        setEc("");
        setNote("");
        toast({ title: "Eingetragen" });
      },
      onError: (err) => toast({ title: "Nicht eingetragen", description: errorText(err, ""), variant: "destructive" }),
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate({ plantId: detail.plant.id, data: { date, heightCm: num(height), waterMl: num(water), ph: num(ph), ec: num(ec), note: note.trim() || null } });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3 flex flex-col gap-1.5 sm:col-span-1">
          <Label htmlFor="l-date">Datum</Label>
          <Input id="l-date" type="date" min={detail.plant.startedOn} max={todayIso()} required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="l-height">Höhe cm</Label>
          <Input id="l-height" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="l-water">Wasser ml</Label>
          <Input id="l-water" inputMode="numeric" value={water} onChange={(e) => setWater(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="l-ph">pH</Label>
          <Input id="l-ph" inputMode="decimal" value={ph} onChange={(e) => setPh(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="l-ec">EC</Label>
          <Input id="l-ec" inputMode="decimal" value={ec} onChange={(e) => setEc(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="l-note">Notiz</Label>
        <Input id="l-note" maxLength={1000} value={note} placeholder="z. B. getoppt, umgetopft, erste Blütenstempel" onChange={(e) => setNote(e.target.value)} />
      </div>
      <Button type="submit" size="sm" disabled={add.isPending}>
        {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Eintragen
      </Button>
    </form>
  );
}

function Plant({ detail }: { detail: GrowPlantDetail }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(false);
  const p = detail.plant;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getGetGrowPlantQueryKey(p.id) });
    void queryClient.invalidateQueries({ queryKey: getGetGrowOverviewQueryKey() });
  };
  const update = useUpdateGrowPlant({
    mutation: {
      onSuccess() {
        refresh();
        setEditing(false);
      },
      onError: (err) => toast({ title: "Nicht gespeichert", description: errorText(err, ""), variant: "destructive" }),
    },
  });
  const remove = useDeleteGrowPlant({
    mutation: {
      onSuccess() {
        void queryClient.invalidateQueries({ queryKey: getGetGrowOverviewQueryKey() });
        navigate("/grow");
      },
    },
  });
  const removeLog = useDeleteGrowLog({ mutation: { onSuccess: refresh } });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{p.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[p.strain, p.breeder].filter(Boolean).join(" · ") || "Sorte unbekannt"}
          </p>
          <p className="text-xs text-muted-foreground">
            {STRAIN_TYPE_LABELS[p.strainType]} · {FLOWERING_LABELS[p.flowering]} · {SEED_SEX_LABELS[p.seedSex]} · {p.flowerWeeks} Wochen Blüte
          </p>
          <p className="text-xs text-muted-foreground">
            {detail.grow.name}: {ENVIRONMENT_LABELS[detail.grow.environment]}, {MEDIUM_LABELS[detail.grow.medium]}
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" />
          Ändern
        </Button>
      </div>

      <section className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">{p.plan.current === "done" ? "Abgeschlossen" : dayText(p.plan.day)}</p>
          <p className="text-xs text-muted-foreground">
            {p.harvestedOn ? `Geerntet am ${deDay(p.harvestedOn)}` : `Ernte etwa ${deDay(p.plan.harvestOn)}`}
            {p.flowering === "photo" && !p.harvestedOn && ` · Blüte ab ${deDay(p.plan.flipOn)}`}
          </p>
        </div>
        <Timeline plan={p.plan} />
        {(p.wetGrams != null || p.dryGrams != null) && (
          <p className="text-xs">
            {p.wetGrams != null && `Nass ${p.wetGrams} g`}
            {p.wetGrams != null && p.dryGrams != null && " · "}
            {p.dryGrams != null && `Trocken ${p.dryGrams} g`}
          </p>
        )}
      </section>

      {p.plan.hints.map((h) => (
        <p key={h} className="flex gap-2 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          {h}
        </p>
      ))}

      {p.plan.current !== "done" && <Targets plan={p.plan} />}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Grow-Plan</h2>
        <ul className="space-y-1.5 text-sm">
          {p.plan.steps.map((s) => (
            <li key={s.on + s.text} className={`flex items-start gap-2 ${s.past ? "text-muted-foreground" : ""}`}>
              {s.past ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
              <span>
                <span className="font-medium">{deDay(s.on)}</span> {s.text}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {p.plan.current !== "done" && <GrowCheckSection detail={detail} />}

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <NotebookPen className="h-4 w-4" />
          Tagebuch
        </h2>
        <LogForm detail={detail} />
        {detail.logs.length > 0 && (
          <ul className="divide-y divide-border text-sm">
            {detail.logs.map((l) => (
              <li key={l.id} className="flex items-start gap-2 py-2">
                <span className="flex-1">
                  <span className="font-medium">{deDay(l.date)}</span>
                  <span className="text-muted-foreground">
                    {[l.heightCm != null && `${l.heightCm} cm`, l.waterMl != null && `${l.waterMl} ml`, l.ph != null && `pH ${l.ph}`, l.ec != null && `EC ${l.ec}`].filter(Boolean).map((t) => ` · ${t}`)}
                  </span>
                  {l.note && <span className="block">{l.note}</span>}
                </span>
                <button type="button" aria-label="Eintrag löschen" className="text-muted-foreground hover:text-destructive" onClick={() => removeLog.mutate({ logId: l.id })}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
        onClick={() => window.confirm(`„${p.name}“ mit allen Einträgen löschen?`) && remove.mutate({ plantId: p.id })}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Pflanze löschen
      </button>

      {editing && (
        <GrowPlantDialog plant={p} busy={update.isPending} onSubmit={(data) => update.mutate({ plantId: p.id, data })} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

/** /grow/pflanze/:plantId – one plant: plan, targets, steps and Tagebuch. */
export default function GrowPlantPage() {
  const params = useParams<{ plantId: string }>();
  const plantId = Number(params.plantId);
  const detail = useGetGrowPlant(plantId);
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/grow" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Grow
      </Link>
      {detail.isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : !detail.data ? (
        <p className="text-sm text-muted-foreground">Diese Pflanze gibt es nicht (mehr).</p>
      ) : (
        <Plant detail={detail.data} />
      )}
    </div>
  );
}
