import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, Bell, Camera, Droplets, Info, Leaf, Loader2, Plus, Repeat, Scale, Snowflake, Trash2, Wheat, X } from "lucide-react";
import {
  getListFarmFeedsQueryKey,
  getListRationsQueryKey,
  useAddFarmFeed,
  useCreateFeedReminders,
  useEnsureOwnFarm,
  useGetFarmFarming,
  useGetFeedReference,
  useListFarmAnimals,
  useListFarmFeeds,
  useListHerds,
  useListRations,
  useReadFeedLabel,
  useRemoveFarmFeed,
  useRemoveRation,
  useSaveRation,
  type FarmFeed,
  type FarmSpecies,
  type FarmSummary,
  type Feed,
  type FeedCategory,
  type FeedLabelReading,
  type LifeStage,
  type RationEvaluation,
  type RationSeason,
} from "@workspace/api-client-react";
import { FeedOriginsCard, OrganicSharesBox } from "@/components/feed-organic";
import { PremiumBadge } from "@/components/premium-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { downscaleFile } from "@/lib/image";
import { SPECIES_LABELS } from "@/lib/farm-labels";
import { certifiedIn } from "@/lib/farming-labels";
import { CATEGORY_LABELS, NUTRIENT_LABELS, SEASON_LABELS, STAGE_LABELS, formatRange, formatValue, grams, light, lightText, rationName, shareText, shortDate } from "@/lib/feed-labels";
import { berlinToday, dayLabel } from "@/lib/weather-labels";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { HubGrid, HubTile } from "@/components/hub-tile";
import { tileOf } from "@/lib/module-look";

const TIMES = ["morgens", "mittags", "abends"] as const;
const DOT = { green: "bg-emerald-500", yellow: "bg-amber-400", red: "bg-red-600" } as const;
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

const decimal = (n: number) => String(n).replace(".", ",");

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

interface Target {
  kind: "animal" | "herd";
  id: number;
  name: string;
  species: FarmSpecies;
  count: number;
}

// ── Fütterungsplan: change of feed and season hints ──────────────────────────

function TransitionBox({ transition: t }: { transition: NonNullable<RationEvaluation["transition"]> }) {
  const title =
    t.reason === "season"
      ? t.day === 0
        ? `Umstellung auf die ${rationName(t.toSeason ?? "all")} ab ${shortDate(t.startedOn)}`
        : `Umstellung auf die ${rationName(t.toSeason ?? "all")} – Tag ${t.day} von ${t.days}`
      : `Futterumstellung – Tag ${t.day} von ${t.days}`;
  return (
    <div className="space-y-2 rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
      <p className="flex items-center gap-2 font-medium">
        <Repeat className="h-4 w-4 shrink-0" />
        {title}
      </p>
      {t.day > 0 && (
        <div>
          <p className="text-xs">Heute {shareText(t.newShare)} neue Ration, je Tier:</p>
          <ul className="mt-1 space-y-0.5">
            {t.items.map((i) => (
              <li key={i.name} className="flex justify-between gap-2">
                <span>{i.name}</span>
                <span className="tabular-nums">{grams(i.grams)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs">
        {t.phases.map((ph) => `Tag ${ph.fromDay === ph.toDay ? ph.fromDay : `${ph.fromDay}–${ph.toDay}`}: ${shareText(ph.newShare)}`).join(" · ")} neu, fertig am {shortDate(t.endsOn)} – langsam
        umstellen schont die Verdauung.
      </p>
    </div>
  );
}

function SeasonHints({ hints }: { hints: string[] }) {
  if (hints.length === 0) return null;
  return (
    <ul className="space-y-1 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
      {hints.map((h) => (
        <li key={h} className="flex gap-2">
          <Leaf className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          {h}
        </li>
      ))}
    </ul>
  );
}

/** More feed for the cold ahead (forecast at the farm), per animal and for the group. */
function ColdBox({ ration }: { ration: RationEvaluation }) {
  const cold = ration.cold;
  if (!cold) return null;
  const perAnimal = cold.extra.reduce((s, e) => s + e.grams, 0);
  const count = ration.target.count;
  return (
    <p className="flex gap-2 rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100" data-testid="cold-boost">
      <Snowflake className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="font-medium">{dayLabel(cold.date, berlinToday())}:</span> {cold.text}
        {count > 1 && perAnimal > 0 && ` Für alle ${count} zusammen ${grams(perAnimal * count)} mehr am Tag.`}
      </span>
    </p>
  );
}

// ── Check of one ration ──────────────────────────────────────────────────────

function RationResult({ ration }: { ration: RationEvaluation }) {
  return (
    <div className="space-y-3 text-sm">
      {ration.warnings.length > 0 && (
        <div role="alert" className="space-y-1.5 rounded-xl border-2 border-red-600 bg-red-50 p-3 text-red-950 dark:bg-red-950/40 dark:text-red-100">
          {ration.warnings.map((w) => (
            <p key={w.text} className="flex gap-2">
              <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
              {w.text}
            </p>
          ))}
        </div>
      )}
      <ul className="space-y-1">
        {ration.items.map((i, k) => (
          <li key={k} className="flex justify-between gap-2">
            <span>{i.name}</span>
            <span className="tabular-nums text-muted-foreground">{grams(i.grams)} je Tier/Tag</span>
          </li>
        ))}
      </ul>
      {ration.checks.length > 0 ? (
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-normal">Nährstoff</th>
              <th className="py-1 text-right font-normal">Ist</th>
              <th className="py-1 text-right font-normal">Richtwert</th>
              <th className="py-1 pl-2 text-left font-normal">Ampel</th>
            </tr>
          </thead>
          <tbody>
            {ration.checks.map((c) => (
              <tr key={c.nutrient} className="border-t border-border align-top">
                <td className="py-1.5">
                  {NUTRIENT_LABELS[c.nutrient].label}
                  {c.tip && <span className="mt-0.5 block text-muted-foreground">{c.tip}</span>}
                </td>
                <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{formatValue(c)}</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{formatRange(c)}</td>
                <td className="py-1.5 pl-2">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span className={cn("h-2.5 w-2.5 rounded-full", DOT[light(c)])} />
                    {lightText(c)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-muted-foreground">Für {SPECIES_LABELS[ration.target.species]} gibt es keine Rationsrechnung – Alleinfutter nach Herstellerangabe.</p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {ration.times.length > 0 && <span>Fütterung: {ration.times.join(", ")}</span>}
        {ration.need && (
          <span className="inline-flex items-center gap-1">
            <Droplets className="h-3.5 w-3.5" />
            Wasser etwa {ration.need.waterL.toLocaleString("de-DE")} l je Tier/Tag
          </span>
        )}
        {ration.target.count > 1 && (
          <span>
            Gruppe ({ration.target.count} Tiere): {ration.group.feedKg.toLocaleString("de-DE")} kg Futter
            {ration.group.waterL !== null && `, ${ration.group.waterL.toLocaleString("de-DE")} l Wasser`} am Tag
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Nährstoffe auf die Trockenmasse gerechnet; Richtwerte für ein typisches Tier{ration.need ? ` (${ration.need.weightKg.toLocaleString("de-DE")} kg)` : ""}.
      </p>
      {ration.organic && <OrganicSharesBox shares={ration.organic} />}
    </div>
  );
}

// ── Editing a ration ─────────────────────────────────────────────────────────

interface ItemDraft {
  ref: string; // "k:<key>" or "o:<id>"
  grams: string;
}

function RationDialog({
  farmId,
  target,
  ration,
  season: initialSeason,
  catalog,
  own,
  stages,
  onClose,
}: {
  farmId: number;
  target: Target;
  ration: RationEvaluation | undefined;
  season: RationSeason;
  catalog: Feed[];
  own: FarmFeed[];
  stages: LifeStage[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [stage, setStage] = useState<LifeStage>(ration?.stage ?? stages[0] ?? "maintenance");
  const [items, setItems] = useState<ItemDraft[]>(
    ration?.items.map((i) => ({ ref: i.feedKey ? `k:${i.feedKey}` : `o:${i.feedId}`, grams: String(i.grams).replace(".", ",") })) ?? [{ ref: "", grams: "" }],
  );
  const [times, setTimes] = useState<string[]>(ration?.times ?? ["morgens", "abends"]);
  const [season, setSeason] = useState<RationSeason>(ration?.season ?? initialSeason);
  const [gradual, setGradual] = useState(true);
  const save = useSaveRation({
    mutation: {
      onSuccess() {
        void queryClient.invalidateQueries({ queryKey: getListRationsQueryKey(farmId) });
        onClose();
      },
      onError: (err) => toast({ title: "Nicht gespeichert", description: errorText(err, "Bitte prüfe die Ration."), variant: "destructive" }),
    },
  });
  const remove = useRemoveRation({
    mutation: {
      onSuccess() {
        void queryClient.invalidateQueries({ queryKey: getListRationsQueryKey(farmId) });
        onClose();
      },
    },
  });
  const groups = useMemo(() => {
    const byCat = new Map<FeedCategory, Feed[]>();
    for (const f of catalog) {
      // Mineral feed for other species is not offered at all.
      if (f.forSpecies && !f.forSpecies.includes(target.species)) continue;
      byCat.set(f.category, [...(byCat.get(f.category) ?? []), f]);
    }
    return [...byCat.entries()];
  }, [catalog, target.species]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = items
      .filter((i) => i.ref)
      .map((i) => {
        const g = Number(i.grams.replace(",", "."));
        return i.ref.startsWith("k:") ? { feedKey: i.ref.slice(2), grams: g } : { feedId: Number(i.ref.slice(2)), grams: g };
      });
    if (parsed.length === 0 || parsed.some((p) => !Number.isFinite(p.grams) || p.grams <= 0)) {
      toast({ title: "Bitte Futtermittel und Menge in Gramm angeben", variant: "destructive" });
      return;
    }
    save.mutate({
      farmId,
      data: {
        ...(target.kind === "animal" ? { animalId: target.id } : { herdId: target.id }),
        season,
        stage,
        items: parsed,
        times: times as ("morgens" | "mittags" | "abends")[],
        gradual,
      },
    });
  }

  const hintFor = (ref: string) => (ref.startsWith("k:") ? catalog.find((f) => f.key === ref.slice(2))?.hint : null);

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rationName(season)} für {target.name}
          </DialogTitle>
          <DialogDescription>
            {SPECIES_LABELS[target.species]}
            {target.kind === "herd" ? ` · Mengen je Tier, Gruppe mit ${target.count} Tieren` : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ration-season">Gilt</Label>
            <select id="ration-season" className={selectClass} value={season} disabled={!!ration} onChange={(e) => setSeason(e.target.value as RationSeason)}>
              {(Object.keys(SEASON_LABELS) as RationSeason[]).map((s) => (
                <option key={s} value={s}>
                  {SEASON_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ration-stage">Lebensphase</Label>
            <select id="ration-stage" className={selectClass} value={stage} onChange={(e) => setStage(e.target.value as LifeStage)}>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Futter je Tier und Tag</p>
            {items.map((item, k) => (
              <div key={k} className="space-y-1">
                <div className="flex gap-2">
                  <select
                    aria-label={`Futtermittel ${k + 1}`}
                    className={cn(selectClass, "flex-1")}
                    value={item.ref}
                    onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, ref: e.target.value } : x)))}
                  >
                    <option value="">Futtermittel wählen …</option>
                    {own.length > 0 && (
                      <optgroup label="Eigene Futtermittel">
                        {own.map((f) => (
                          <option key={f.id} value={`o:${f.id}`}>
                            {f.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {groups.map(([cat, feeds]) => (
                      <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                        {feeds.map((f) => (
                          <option key={f.key} value={`k:${f.key}`}>
                            {f.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <Input
                    aria-label={`Gramm ${k + 1}`}
                    inputMode="decimal"
                    placeholder="g"
                    className="w-20"
                    value={item.grams}
                    onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, grams: e.target.value } : x)))}
                  />
                  <button type="button" aria-label="Zeile entfernen" className="px-1 text-muted-foreground hover:text-destructive" onClick={() => setItems(items.filter((_, j) => j !== k))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {hintFor(item.ref) && <p className="pl-1 text-xs text-muted-foreground">{hintFor(item.ref)}</p>}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setItems([...items, { ref: "", grams: "" }])}>
              <Plus className="h-4 w-4" />
              Futtermittel
            </Button>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Fütterungszeiten</p>
            <div className="flex gap-2">
              {TIMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={times.includes(t)}
                  onClick={() => setTimes(times.includes(t) ? times.filter((x) => x !== t) : [...times, t])}
                  className={cn("rounded-full border px-3 py-1 text-xs", times.includes(t) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={gradual} onChange={(e) => setGradual(e.target.checked)} />
            <span>
              Schrittweise umstellen
              <span className="block text-xs text-muted-foreground">Ändern sich die Futtermittel, verteilt der Plan den Wechsel über einige Tage.</span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={save.isPending} className="gap-1.5">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Speichern und prüfen
            </Button>
            {ration && (
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={remove.isPending} onClick={() => remove.mutate({ farmId, rationId: ration.id })}>
                Ration löschen
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Own feed from a label ────────────────────────────────────────────────────

const LABEL_FIELDS = [
  ["crudeProtein", "Rohprotein %"],
  ["crudeFat", "Rohfett %"],
  ["crudeFibre", "Rohfaser %"],
  ["calcium", "Calcium %"],
  ["phosphorus", "Phosphor %"],
  ["copper", "Kupfer mg/kg"],
] as const;

function OwnFeedDialog({ farmId, onClose }: { farmId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const photo = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<FeedCategory>("compound");
  const [dm, setDm] = useState("88");
  const [values, setValues] = useState<Record<string, string>>({});
  const [reading, setReading] = useState<FeedLabelReading | null>(null);
  const [forSpecies, setForSpecies] = useState<FarmSpecies[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const read = useReadFeedLabel({
    mutation: {
      onSuccess(r) {
        setReading(r);
        if (r.name) setName(r.name);
        setCategory(r.category);
        if (r.dryMatter !== null) setDm(decimal(r.dryMatter));
        setValues(Object.fromEntries(LABEL_FIELDS.map(([key]) => [key, r.label[key] === null ? "" : decimal(r.label[key]!)])));
        setForSpecies(r.forSpecies);
      },
      onError: (err) => setPhotoError(errorText(err, "Die KI ist gerade nicht erreichbar.")),
    },
  });
  const add = useAddFarmFeed({
    mutation: {
      onSuccess() {
        void queryClient.invalidateQueries({ queryKey: getListFarmFeedsQueryKey(farmId) });
        toast({ title: "Futtermittel gespeichert" });
        onClose();
      },
      onError: (err) => toast({ title: "Nicht gespeichert", description: errorText(err, "Bitte prüfe die Werte."), variant: "destructive" }),
    },
  });
  const num = (s: string | undefined) => (s && s.trim() ? Number(s.replace(",", ".")) : NaN);
  const reads = preparing || read.isPending;
  const missing = reading ? LABEL_FIELDS.filter(([key]) => key !== "copper" && reading.label[key] === null).map(([, label]) => label.replace(" %", "")) : [];

  function submit(event: FormEvent) {
    event.preventDefault();
    const label = {
      crudeProtein: num(values["crudeProtein"]),
      crudeFat: num(values["crudeFat"]),
      crudeFibre: num(values["crudeFibre"]),
      calcium: num(values["calcium"]),
      phosphorus: num(values["phosphorus"]),
      copper: Number.isFinite(num(values["copper"])) ? num(values["copper"]) : null,
    };
    if ([label.crudeProtein, label.crudeFat, label.crudeFibre, label.calcium, label.phosphorus].some((v) => !Number.isFinite(v))) {
      toast({ title: "Bitte alle Werte vom Etikett eintragen", description: "Kupfer ist freiwillig.", variant: "destructive" });
      return;
    }
    add.mutate({
      farmId,
      data: { name: name.trim(), category, dryMatter: num(dm), label, forSpecies: forSpecies.length ? forSpecies : null, additives: reading?.additives.length ? reading.additives : null },
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !add.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Eigenes Futtermittel</DialogTitle>
          <DialogDescription>Werte vom Etikett unter „Analytische Bestandteile“ – so, wie sie dort stehen.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <input
            ref={photo}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Foto vom Etikett"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setPhotoError(null);
              setPreparing(true);
              try {
                // Small print: a little more resolution than other photos.
                read.mutate({ farmId, data: { imageData: await downscaleFile(file, 1600, 0.8) } });
              } finally {
                setPreparing(false);
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={reads} onClick={() => photo.current?.click()}>
              {reads ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Etikett fotografieren
            </Button>
            <PremiumBadge />
          </div>
          {reads && <p className="text-xs text-muted-foreground">Die KI liest das Etikett …</p>}
          {photoError && <p role="alert" className="text-xs text-destructive">{photoError}</p>}
          {reading && (
            <div className="space-y-1.5 text-xs">
              <p className="font-medium text-amber-800 dark:text-amber-300">Von der KI gelesen – bitte jeden Wert mit dem Etikett vergleichen, bevor du speicherst.</p>
              {missing.length > 0 && <p className="text-muted-foreground">Nicht lesbar: {missing.join(", ")} – bitte selbst eintragen.</p>}
              {reading.dryMatter === null && <p className="text-muted-foreground">Keine Feuchtigkeit aufgedruckt – Trockenmasse 88 % angenommen.</p>}
              {reading.ionophores.length > 0 && (
                <p role="alert" className="flex gap-1.5 rounded-lg border-2 border-red-600 bg-red-50 p-2 text-red-950 dark:bg-red-950/40 dark:text-red-100">
                  <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Enthält {reading.ionophores.join(", ")} (Kokzidiostatikum): nur für Geflügel – für Pferde schon in kleinen Mengen tödlich.
                </p>
              )}
              {reading.additives.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-muted-foreground">Zusatzstoffe ({reading.additives.length})</summary>
                  <ul className="mt-1 list-disc pl-4">
                    {reading.additives.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="feed-name">Name</Label>
            <Input id="feed-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Legemehl vom Landhandel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="feed-cat">Art</Label>
              <select id="feed-cat" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as FeedCategory)}>
                {(Object.keys(CATEGORY_LABELS) as FeedCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="feed-dm">Trockenmasse %</Label>
              <Input id="feed-dm" inputMode="decimal" value={dm} onChange={(e) => setDm(e.target.value)} />
            </div>
            {LABEL_FIELDS.map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Label htmlFor={`feed-${key}`}>{label}</Label>
                <Input
                  id={`feed-${key}`}
                  inputMode="decimal"
                  className={cn(reading && key !== "copper" && reading.label[key] === null && "border-amber-500")}
                  value={values[key] ?? ""}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          {forSpecies.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Laut Etikett für</p>
              <div className="flex flex-wrap gap-1.5">
                {forSpecies.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-label={`${SPECIES_LABELS[s]} entfernen`}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs"
                    onClick={() => setForSpecies(forSpecies.filter((x) => x !== s))}
                  >
                    {SPECIES_LABELS[s]}
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Bekommt eine andere Tierart dieses Futter, warnt der Futterplaner.</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Trockenmasse: 88 % bei Trockenfutter; steht selten auf dem Etikett.</p>
          <Button type="submit" disabled={add.isPending || reads} className="gap-1.5">
            {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function Planner({ farm }: { farm: FarmSummary }) {
  const queryClient = useQueryClient();
  const canWrite = farm.role !== "guest";
  const reference = useGetFeedReference();
  const animals = useListFarmAnimals(farm.id);
  const herds = useListHerds(farm.id);
  const rations = useListRations(farm.id);
  const own = useListFarmFeeds(farm.id);
  // Bio (docs/bio.md): origins of the feeds only on an organic farm.
  const organicFarm = certifiedIn(useGetFarmFarming(farm.id).data, "feed");
  const removeFeed = useRemoveFarmFeed({ mutation: { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListFarmFeedsQueryKey(farm.id) }) } });
  const { toast } = useToast();
  const [editing, setEditing] = useState<{ target: Target; season: RationSeason; ration: RationEvaluation | undefined } | null>(null);
  const reminders = useCreateFeedReminders({
    mutation: {
      onSuccess: (r) =>
        toast({
          title: r.created > 0 ? `${r.created} ${r.created === 1 ? "Erinnerung" : "Erinnerungen"} angelegt` : "Erinnerungen aktualisiert",
          description: "Täglich unter Stall-Aufgaben, mit den Mengen je Fütterung.",
        }),
      onError: (err) => toast({ title: "Nicht angelegt", description: errorText(err, ""), variant: "destructive" }),
    },
  });
  // "Futteretikett lesen" from the scan menu opens the label dialog right away.
  const [ownDialog, setOwnDialog] = useState(() => canWrite && new URLSearchParams(window.location.search).has("etikett"));

  const targets: Target[] = useMemo(() => {
    const active = (animals.data ?? []).filter((a) => !a.archivedAt);
    return [
      ...(herds.data ?? []).map((h) => ({ kind: "herd" as const, id: h.id, name: h.name, species: h.species, count: Math.max(1, active.filter((a) => a.herdId === h.id).length) })),
      ...active.filter((a) => a.herdId === null).map((a) => ({ kind: "animal" as const, id: a.id, name: a.name, species: a.species, count: 1 })),
    ];
  }, [animals.data, herds.data]);
  const rationsOf = (t: Target) => (rations.data ?? []).filter((r) => r.target.kind === t.kind && r.target.id === t.id);

  if (!reference.data || animals.isLoading || herds.isLoading || rations.isLoading) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  const stagesOf = (s: FarmSpecies) => reference.data!.species.find((x) => x.species === s)?.stages ?? ["maintenance"];

  return (
    <div className="space-y-5">
      <div className="flex gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Küchen- und Speiseabfälle dürfen an Nutztiere nicht verfüttert werden (VO (EG) 1069/2009), auch in der Hobbyhaltung – bei Geflügel auch keine Eier und
          Eierschalen aus dem eigenen Bestand. Die App schlägt deshalb keine Küchenreste vor.
        </p>
      </div>

      {targets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Leg zuerst Tiere oder Gruppen unter <Link href="/farm" className="underline">Tiere</Link> an.
        </p>
      ) : (
        <ul className="space-y-3">
          {targets.map((t) => {
            const all = rationsOf(t);
            const r = all.find((x) => x.active);
            const others = all.filter((x) => !x.active);
            const missing = (["summer", "winter"] as const).filter((season) => !all.some((x) => x.season === season));
            const lights = r?.checks.map(light) ?? [];
            return (
              <li key={`${t.kind}-${t.id}`} className="space-y-3 rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {SPECIES_LABELS[t.species]}
                      {t.kind === "herd" ? ` · Gruppe, ${t.count} ${t.count === 1 ? "Tier" : "Tiere"}` : ""}
                      {r ? ` · ${STAGE_LABELS[r.stage]}` : ""}
                      {r && r.season !== "all" ? ` · ${rationName(r.season)}` : ""}
                    </p>
                  </div>
                  {r && lights.length > 0 && (
                    <span className="flex gap-1" aria-label={`Ampel: ${lights.filter((l) => l !== "green").length} Hinweise`}>
                      {lights.map((l, k) => (
                        <span key={k} className={cn("h-2.5 w-2.5 rounded-full", DOT[l])} />
                      ))}
                    </span>
                  )}
                </div>
                {r?.transition && <TransitionBox transition={r.transition} />}
                {r ? (
                  <RationResult ration={r} />
                ) : (
                  <p className="text-sm text-muted-foreground">{all.length ? "Für die jetzige Jahreszeit ist keine Ration eingetragen." : "Noch keine Ration eingetragen."}</p>
                )}
                {r && <ColdBox ration={r} />}
                {r && <SeasonHints hints={r.hints} />}
                {others.length > 0 && (
                  <ul className="space-y-1 border-t border-border pt-2 text-xs">
                    {others.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          <span className="font-medium text-foreground">{SEASON_LABELS[o.season]}</span>: {o.items.map((i) => `${i.name} ${grams(i.grams)}`).join(", ")}
                        </span>
                        {canWrite && (
                          <button type="button" className="shrink-0 underline" onClick={() => setEditing({ target: t, season: o.season, ration: o })}>
                            ändern
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canWrite && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant={r ? "outline" : "default"} className="gap-1.5" onClick={() => setEditing({ target: t, season: r?.season ?? "all", ration: r })}>
                      <Scale className="h-4 w-4" />
                      {r ? "Ration ändern" : "Ration anlegen"}
                    </Button>
                    {r && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={reminders.isPending}
                        onClick={() => reminders.mutate({ farmId: farm.id, rationId: r.id })}
                      >
                        <Bell className="h-4 w-4" />
                        Erinnern
                      </Button>
                    )}
                    {all.length > 0 &&
                      missing.map((season) => (
                        <Button key={season} size="sm" variant="ghost" className="gap-1" onClick={() => setEditing({ target: t, season, ration: undefined })}>
                          <Plus className="h-4 w-4" />
                          {rationName(season)}
                        </Button>
                      ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {organicFarm && <FeedOriginsCard farmId={farm.id} rations={rations.data ?? []} canWrite={canWrite} />}

      <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <Wheat className="h-4 w-4 text-primary" />
            Eigene Futtermittel
          </h2>
          {canWrite && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setOwnDialog(true)}>
              <Plus className="h-4 w-4" />
              Vom Etikett
            </Button>
          )}
        </div>
        {(own.data ?? []).length === 0 ? (
          <p className="text-muted-foreground">Futter mit Etikett (Pellets, Mischfutter) einmal eintragen – danach steht es in jeder Ration zur Auswahl.</p>
        ) : (
          <ul className="space-y-1">
            {(own.data ?? []).map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2">
                <span>
                  {f.name}{" "}
                  <span className="text-xs text-muted-foreground">
                    · {CATEGORY_LABELS[f.category]}
                    {f.forSpecies?.length ? ` · für ${f.forSpecies.map((s) => SPECIES_LABELS[s as FarmSpecies] ?? s).join(", ")}` : ""}
                  </span>
                </span>
                {canWrite && (
                  <button
                    type="button"
                    aria-label={`${f.name} löschen`}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      removeFeed.mutate(
                        { farmId: farm.id, feedId: f.id },
                        { onError: (err) => toast({ title: "Nicht gelöscht", description: errorText(err, ""), variant: "destructive" }) },
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Futter- und Bedarfswerte sind Richtwerte aus der Fachliteratur für ein typisches Tier. Bei Krankheit, Trächtigkeit mit Problemen oder Jungtieren: Tierarzt fragen.
      </p>

      {editing && (
        <RationDialog
          farmId={farm.id}
          target={editing.target}
          ration={editing.ration}
          season={editing.season}
          catalog={reference.data.feeds}
          own={own.data ?? []}
          stages={stagesOf(editing.target.species)}
          onClose={() => setEditing(null)}
        />
      )}
      {ownDialog && <OwnFeedDialog farmId={farm.id} onClose={() => setOwnDialog(false)} />}
    </div>
  );
}

/** /farm/futter – Futterplaner: rations per animal or herd, checked against the need. */
export default function FutterplanerPage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="futter" subtitle="Was deine Tiere bekommen – abgeglichen mit dem, was sie brauchen." />
      <HubGrid>
        <HubTile {...tileOf("futter-vorrat")} tag="Premium" />
        <HubTile {...tileOf("futter-tipps")} />
      </HubGrid>
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Planner farm={farm} />}
    </div>
  );
}
