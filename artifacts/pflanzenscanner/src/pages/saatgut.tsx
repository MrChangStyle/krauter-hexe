import { useEffect, useState, type FormEvent } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Leaf, Loader2, Pencil, Plus, ShoppingBasket } from "lucide-react";
import {
  getGetSeedOverviewQueryKey,
  getGetGardenCatalogQueryKey,
  useCreateSeed,
  useEnsureOwnFarm,
  useGetFarmFarming,
  useGetGardenCatalog,
  useGetSeedOverview,
  useRecordGerminationTest,
  useUpdateSeed,
  type FarmSummary,
  type Seed,
  type SeedInput,
  type SeedSource,
  type SeedUnit,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { todayIso } from "@/lib/farm-labels";
import { certifiedIn, organicAdviceIn } from "@/lib/farming-labels";
import { conventionalSeeds } from "@/lib/organic-check";
import { SAVING_TEXT, SEED_STATUS, SOURCE_LABELS, amountText, seedBasis } from "@/lib/seed-labels";
import { PageHeader } from "@/components/page-header";
import { OrganicAreaSwitch } from "@/components/organic-area-switch";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

function useRefresh(farm: FarmSummary) {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: getGetSeedOverviewQueryKey(farm.id) });
}

function SeedDialog({ farm, seed, cropKey, showOrganic, onClose }: { farm: FarmSummary; seed: Seed | null; cropKey?: string; showOrganic: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const refresh = useRefresh(farm);
  const catalog = useGetGardenCatalog({ query: { queryKey: getGetGardenCatalogQueryKey(), staleTime: 5 * 60 * 1000 } });
  const crops = [...(catalog.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, "de"));
  const [form, setForm] = useState({
    cropKey: seed?.cropKey ?? cropKey ?? "",
    name: seed && !seed.cropKey ? seed.name : seed && seed.cropName !== seed.name ? seed.name : "",
    variety: seed?.variety ?? "",
    amount: seed ? String(seed.amount).replace(".", ",") : "1",
    unit: (seed?.unit ?? "Tüten") as SeedUnit,
    source: (seed?.source ?? "bought") as SeedSource,
    harvestYear: seed?.harvestYear ? String(seed.harvestYear) : "",
    useBy: seed?.useBy ?? "",
    openPollinated: seed?.openPollinated === null || seed?.openPollinated === undefined ? "" : seed.openPollinated ? "yes" : "no",
    organic: seed?.organic === null || seed?.organic === undefined ? "" : seed.organic ? "yes" : "no",
    notes: seed?.notes ?? "",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const handlers = {
    onSuccess() {
      refresh();
      toast({ title: "Gespeichert" });
      onClose();
    },
    onError: (err: unknown) => toast({ title: "Nicht gespeichert", description: errorText(err, ""), variant: "destructive" }),
  };
  const create = useCreateSeed({ mutation: handlers });
  const update = useUpdateSeed({ mutation: handlers });
  const busy = create.isPending || update.isPending;

  function data(archived?: boolean): SeedInput {
    return {
      cropKey: form.cropKey || null,
      name: form.name.trim() || null,
      variety: form.variety.trim() || null,
      amount: Number(form.amount.replace(",", ".")),
      unit: form.unit,
      source: form.source,
      harvestYear: form.harvestYear ? Number(form.harvestYear) : null,
      useBy: form.useBy || null,
      openPollinated: form.openPollinated === "" ? null : form.openPollinated === "yes",
      organic: form.organic === "" ? null : form.organic === "yes",
      notes: form.notes.trim() || null,
      ...(archived === undefined ? {} : { archived }),
    };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (seed) update.mutate({ farmId: farm.id, seedId: seed.id, data: data() });
    else create.mutate({ farmId: farm.id, data: data() });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{seed ? "Saatgut ändern" : "Saatgut eintragen"}</DialogTitle>
          <DialogDescription>Erntejahr oder „verwendbar bis“ von der Tüte – daraus rechnet die App, wie lange es noch gut keimt.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-crop">Kultur</Label>
            <select id="s-crop" className={selectClass} value={form.cropKey} onChange={(e) => set({ cropKey: e.target.value })}>
              <option value="">Andere (Name unten)</option>
              {crops.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-name">{form.cropKey ? "Eigener Name" : "Name"}</Label>
              <Input id="s-name" maxLength={60} required={!form.cropKey} value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-variety">Sorte</Label>
              <Input id="s-variety" maxLength={60} value={form.variety} placeholder="z. B. Ochsenherz" onChange={(e) => set({ variety: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-amount">Menge</Label>
              <Input id="s-amount" inputMode="decimal" required value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-unit">Einheit</Label>
              <select id="s-unit" className={selectClass} value={form.unit} onChange={(e) => set({ unit: e.target.value as SeedUnit })}>
                <option value="Tüten">Tüten</option>
                <option value="g">Gramm</option>
                <option value="Korn">Korn</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-year">Erntejahr</Label>
              <Input id="s-year" type="number" min={1990} max={new Date().getFullYear()} value={form.harvestYear} onChange={(e) => set({ harvestYear: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-useby">Verwendbar bis</Label>
              <Input id="s-useby" type="date" value={form.useBy} onChange={(e) => set({ useBy: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-source">Herkunft</Label>
              <select id="s-source" className={selectClass} value={form.source} onChange={(e) => set({ source: e.target.value as SeedSource })}>
                {(Object.keys(SOURCE_LABELS) as SeedSource[]).map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-op">Samenfest?</Label>
              <select id="s-op" className={selectClass} value={form.openPollinated} onChange={(e) => set({ openPollinated: e.target.value })}>
                <option value="">Weiß nicht</option>
                <option value="yes">Samenfest</option>
                <option value="no">F1-Hybride</option>
              </select>
            </div>
          </div>
          {/* Only for farms that farm naturally or organically (docs/bio.md, B7); a value stays when the farm switches back. */}
          {showOrganic && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-organic">Bio-Saatgut?</Label>
              <select id="s-organic" className={selectClass} value={form.organic} onChange={(e) => set({ organic: e.target.value })}>
                <option value="">Weiß nicht</option>
                <option value="yes">Bio-Saatgut</option>
                <option value="no">Konventionell</option>
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-notes">Notiz</Label>
            <Textarea id="s-notes" rows={2} maxLength={2000} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Speichern
            </Button>
            {seed && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => update.mutate({ farmId: farm.id, seedId: seed.id, data: data(!seed.archived) })}>
                {seed.archived ? "Wieder in den Vorrat" : "Archivieren"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TestDialog({ farm, seed, onClose }: { farm: FarmSummary; seed: Seed; onClose: () => void }) {
  const { toast } = useToast();
  const refresh = useRefresh(farm);
  const [sown, setSown] = useState("20");
  const [germinated, setGerminated] = useState("");
  const [testedOn, setTestedOn] = useState(todayIso());
  const test = useRecordGerminationTest({
    mutation: {
      onSuccess(s) {
        refresh();
        toast({ title: `Keimrate ${Math.round((s.germinationRate ?? 0) * 100)} %`, description: SEED_STATUS[s.status].label });
        onClose();
      },
      onError: (err) => toast({ title: "Nicht gespeichert", description: errorText(err, ""), variant: "destructive" }),
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    test.mutate({ farmId: farm.id, seedId: seed.id, data: { sown: Number(sown), germinated: Number(germinated), testedOn } });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !test.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keimprobe: {seed.name}</DialogTitle>
          <DialogDescription>
            So geht’s: 20 Samen auf feuchtes Küchenpapier legen, in eine Dose oder Tüte stecken und warm stellen. Nach ein bis zwei Wochen die gekeimten zählen.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-sown">Ausgelegt</Label>
              <Input id="t-sown" type="number" min={1} max={1000} required value={sown} onChange={(e) => setSown(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-germ">Gekeimt</Label>
              <Input id="t-germ" type="number" min={0} max={Number(sown) || 1000} required value={germinated} onChange={(e) => setGerminated(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-date">Gezählt am</Label>
            <Input id="t-date" type="date" max={todayIso()} required value={testedOn} onChange={(e) => setTestedOn(e.target.value)} />
          </div>
          <Button type="submit" disabled={test.isPending}>
            {test.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SeedCard({ seed, canWrite, showOrganic, onEdit, onTest }: { seed: Seed; canWrite: boolean; showOrganic: boolean; onEdit: () => void; onTest: () => void }) {
  const badge = SEED_STATUS[seed.status];
  return (
    <li className={`space-y-1.5 rounded-2xl border bg-card p-4 text-sm ${seed.archived ? "opacity-60" : ""}`} data-testid={`seed-${seed.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">
            {seed.name}
            {seed.variety && <span className="font-normal"> · {seed.variety}</span>}
          </h3>
          <p className="text-xs text-muted-foreground">
            {amountText(seed.amount, seed.unit)} · {SOURCE_LABELS[seed.source]}
            {seed.openPollinated === true && " · samenfest"}
            {seed.openPollinated === false && " · F1"}
            {showOrganic && seed.organic === true && " · Bio"}
            {showOrganic && seed.organic === false && " · konventionell"}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.tone}`}>{badge.label}</span>
      </div>
      <p className="text-xs">{seedBasis(seed)}</p>
      {seed.saving && seed.openPollinated !== false && <p className="text-xs text-muted-foreground">Samen gewinnen: {SAVING_TEXT[seed.saving]}</p>}
      {seed.notes && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{seed.notes}</p>}
      {canWrite && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="gap-1" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            Ändern
          </Button>
          {!seed.archived && seed.saving !== "vegetative" && (
            <Button size="sm" variant="outline" className="gap-1" onClick={onTest}>
              <FlaskConical className="h-3.5 w-3.5" />
              Keimprobe
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function Seeds({ farm }: { farm: FarmSummary }) {
  const overview = useGetSeedOverview(farm.id);
  const [dialog, setDialog] = useState<{ seed: Seed | null; cropKey?: string } | null>(null);
  const [testing, setTesting] = useState<Seed | null>(null);
  const farming = useGetFarmFarming(farm.id);
  const canWrite = farm.role !== "guest";
  if (!overview.data) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  const { seeds, plan } = overview.data;
  const active = seeds.filter((s) => !s.archived);
  const showOrganic = organicAdviceIn(farming.data, "garden");
  const notOrganic = certifiedIn(farming.data, "garden") ? conventionalSeeds(active) : null;
  const archived = seeds.filter((s) => s.archived);

  return (
    <div className="space-y-5">
      {(plan.missing.length > 0 || plan.check.length > 0) && (
        <section className="space-y-2 rounded-2xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShoppingBasket className="h-4 w-4" />
            Für den Beetplan {plan.season}
          </h2>
          {plan.missing.length > 0 && (
            <div>
              <p className="font-medium">Fehlt noch:</p>
              <ul className="flex flex-wrap gap-1.5 pt-1">
                {plan.missing.map((m) => (
                  <li key={m.cropKey}>
                    {canWrite ? (
                      <button type="button" className="rounded-full border border-current px-2 py-0.5 text-xs" onClick={() => setDialog({ seed: null, cropKey: m.cropKey })}>
                        {m.name}
                        {m.vegetative && " (Pflanzgut)"} +
                      </button>
                    ) : (
                      <span className="rounded-full border border-current px-2 py-0.5 text-xs">{m.name}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.check.length > 0 && <p>Nur altes Saatgut – Keimprobe machen oder neu kaufen: {plan.check.map((c) => c.name).join(", ")}</p>}
        </section>
      )}

      {notOrganic && (notOrganic.conventional.length > 0 || notOrganic.unknown.length > 0) && (
        <section className="space-y-1 rounded-2xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100" data-testid="seed-organic-warning">
          <h2 className="flex items-center gap-2 font-semibold">
            <Leaf className="h-4 w-4" />
            Bio-Saatgut
          </h2>
          {notOrganic.conventional.length > 0 && (
            <p>Konventionell: {notOrganic.conventional.map((s) => s.name).join(", ")}. Auf einem Bio-Hof nur, wenn es die Sorte nicht in Bio gibt – mit Ausnahmegenehmigung der Kontrollstelle (Richtwert).</p>
          )}
          {notOrganic.unknown.length > 0 && <p>Noch nicht angegeben: {notOrganic.unknown.map((s) => s.name).join(", ")}.</p>}
        </section>
      )}

      {canWrite && (
        <Button className="gap-1.5" onClick={() => setDialog({ seed: null })}>
          <Plus className="h-4 w-4" />
          Saatgut eintragen
        </Button>
      )}

      {seeds.length === 0 ? (
        <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
          Noch kein Saatgut eingetragen. Die App zeigt dann, wie lange es noch keimt, was für den Beetplan fehlt und wie man selbst Samen gewinnt.
        </p>
      ) : (
        <ul className="space-y-3">
          {active.map((s) => (
            <SeedCard key={s.id} seed={s} canWrite={canWrite} showOrganic={showOrganic} onEdit={() => setDialog({ seed: s })} onTest={() => setTesting(s)} />
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <details className="space-y-2">
          <summary className="cursor-pointer text-sm text-muted-foreground">Archiviert ({archived.length})</summary>
          <ul className="space-y-3 pt-2">
            {archived.map((s) => (
              <SeedCard key={s.id} seed={s} canWrite={canWrite} showOrganic={showOrganic} onEdit={() => setDialog({ seed: s })} onTest={() => setTesting(s)} />
            ))}
          </ul>
        </details>
      )}
      {dialog && <SeedDialog farm={farm} seed={dialog.seed} cropKey={dialog.cropKey} showOrganic={showOrganic} onClose={() => setDialog(null)} />}
      {testing && <TestDialog farm={farm} seed={testing} onClose={() => setTesting(null)} />}
    </div>
  );
}

/** /beete/saatgut – seed packets and saved seed, how long they germinate, and what the bed plan needs. */
export default function SaatgutPage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="saatgut" subtitle="Tüten und eigene Samen im Blick: wie lange sie noch keimen, was für die Beete fehlt und wie man selbst Samen gewinnt. Wer im Gartenkalender „gesät“ abhakt, bucht das Saatgut automatisch ab – bei Mengen in Korn oder Gramm." />
      <OrganicAreaSwitch area="garden" />
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Seeds farm={farm} />}
    </div>
  );
}
