import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Baby, CheckCircle2, Circle, Egg, Heart, Loader2, Plus, Trash2 } from "lucide-react";
import {
  getListBreedingQueryKey,
  getListFarmAnimalsQueryKey,
  useCreateBreeding,
  useDeleteBreeding,
  useEndBreeding,
  useEnsureOwnFarm,
  useListBreeding,
  useListFarmAnimals,
  type BreedingRecord,
  type FarmSpecies,
  type FarmSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { BIRDS, BREEDING_DAYS, breedingTitle, outcomeText, parentChoices, progress } from "@/lib/breeding-labels";
import { SPECIES_LABELS, SPECIES_ORDER, todayIso } from "@/lib/farm-labels";
import { deDay } from "@/lib/medicine-labels";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

function useRefresh(farm: FarmSummary) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: getListBreedingQueryKey(farm.id) });
    void queryClient.invalidateQueries({ queryKey: getListFarmAnimalsQueryKey(farm.id) });
  };
}

function NewDialog({ farm, onClose }: { farm: FarmSummary; onClose: () => void }) {
  const { toast } = useToast();
  const refresh = useRefresh(farm);
  const animals = useListFarmAnimals(farm.id).data ?? [];
  const onFarm = SPECIES_ORDER.filter((s) => BREEDING_DAYS[s] && animals.some((a) => a.species === s && !a.archivedAt));
  const choices: FarmSpecies[] = onFarm.includes("poultry") ? onFarm : [...onFarm, "poultry"];
  // Until one is picked, the first species on the farm (the animals may still be loading).
  const [picked, setPicked] = useState<FarmSpecies | null>(null);
  const species = picked ?? choices[0] ?? "poultry";
  const [motherId, setMotherId] = useState("");
  const [fatherId, setFatherId] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [startedOn, setStartedOn] = useState(todayIso());
  const [bird, setBird] = useState(0);
  const [eggs, setEggs] = useState("12");
  const [notes, setNotes] = useState("");
  const create = useCreateBreeding({
    mutation: {
      onSuccess(r) {
        refresh();
        toast({ title: "Eingetragen", description: `Erwartet am ${deDay(r.dueOn)}.` });
        onClose();
      },
      onError: (err) => toast({ title: "Nicht eingetragen", description: errorText(err, ""), variant: "destructive" }),
    },
  });
  const incubation = species === "poultry";
  const days = incubation ? BIRDS[bird]!.days : BREEDING_DAYS[species]!;
  const mothers = parentChoices(animals, species, "mother");
  const fathers = parentChoices(animals, species, "father");

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate({
      farmId: farm.id,
      data: {
        species,
        motherId: motherId ? Number(motherId) : null,
        fatherId: fatherId && fatherId !== "other" ? Number(fatherId) : null,
        fatherName: fatherId === "other" ? fatherName.trim() || null : null,
        startedOn,
        durationDays: days,
        eggCount: incubation ? Number(eggs) : null,
        notes: notes.trim() || null,
      },
    });
  }

  function pickSpecies(s: FarmSpecies) {
    setPicked(s);
    setMotherId("");
    setFatherId("");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !create.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{incubation ? "Brut eintragen" : "Deckung eintragen"}</DialogTitle>
          <DialogDescription>Die App rechnet den Termin aus und erinnert an die Schritte bis dahin.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b-species">Tierart</Label>
            <select id="b-species" className={selectClass} value={species} onChange={(e) => pickSpecies(e.target.value as FarmSpecies)}>
              {choices.map((s) => (
                <option key={s} value={s}>
                  {SPECIES_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          {incubation && (
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="b-bird">Vogel</Label>
                <select id="b-bird" className={selectClass} value={bird} onChange={(e) => setBird(Number(e.target.value))}>
                  {BIRDS.map((b, k) => (
                    <option key={b.label} value={k}>
                      {b.label} ({b.days} Tage)
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="b-eggs">Eier</Label>
                <Input id="b-eggs" type="number" min={1} max={200} required value={eggs} onChange={(e) => setEggs(e.target.value)} />
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b-mother">{incubation ? "Glucke (wenn sie selbst brütet)" : "Muttertier"}</Label>
            <select id="b-mother" className={selectClass} value={motherId} required={!incubation} onChange={(e) => setMotherId(e.target.value)}>
              <option value="">{incubation ? "Brutapparat" : "Bitte wählen"}</option>
              {mothers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.registrationNumber})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b-father">Vatertier</Label>
            <select id="b-father" className={selectClass} value={fatherId} onChange={(e) => setFatherId(e.target.value)}>
              <option value="">Unbekannt</option>
              {fathers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.registrationNumber})
                </option>
              ))}
              <option value="other">Von einem anderen Hof</option>
            </select>
            {fatherId === "other" && <Input aria-label="Name des Vatertiers" maxLength={60} placeholder="z. B. Deckbock Anton" value={fatherName} onChange={(e) => setFatherName(e.target.value)} />}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b-date">{incubation ? "Eingelegt am" : "Gedeckt am"}</Label>
            <Input id="b-date" type="date" max={todayIso()} required value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
            <span className="text-xs text-muted-foreground">
              {incubation ? "Schlupf" : "Geburt"} nach etwa {days} Tagen.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b-notes">Notiz</Label>
            <Textarea id="b-notes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button type="submit" disabled={create.isPending} className="gap-1.5">
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Eintragen
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EndDialog({ farm, record, outcome, onClose }: { farm: FarmSummary; record: BreedingRecord; outcome: "born" | "failed"; onClose: () => void }) {
  const { toast } = useToast();
  const refresh = useRefresh(farm);
  const [date, setDate] = useState(todayIso());
  const [alive, setAlive] = useState("");
  const [dead, setDead] = useState("0");
  const [createYoung, setCreateYoung] = useState(true);
  const [notes, setNotes] = useState(record.notes ?? "");
  const end = useEndBreeding({
    mutation: {
      onSuccess(r) {
        refresh();
        toast({ title: outcome === "born" ? "Eingetragen" : "Abgeschlossen", description: r.created ? `${r.created} Jungtiere angelegt – Namen und Geschlecht lassen sich beim Tier ändern.` : undefined });
        onClose();
      },
      onError: (err) => toast({ title: "Nicht gespeichert", description: errorText(err, ""), variant: "destructive" }),
    },
  });
  const born = outcome === "born";
  const hatch = record.kind === "incubation";

  function submit(event: FormEvent) {
    event.preventDefault();
    end.mutate({
      farmId: farm.id,
      recordId: record.id,
      data: born ? { outcome, date, alive: Number(alive || 0), dead: Number(dead || 0), createYoung, notes: notes.trim() || null } : { outcome, date, notes: notes.trim() || null },
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !end.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{born ? (hatch ? "Schlupf eintragen" : "Geburt eintragen") : "Nicht trächtig / abbrechen"}</DialogTitle>
          <DialogDescription>{breedingTitle(record)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-date">Datum</Label>
            <Input id="e-date" type="date" min={record.startedOn} max={todayIso()} required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {born && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="e-alive">Lebend</Label>
                  <Input id="e-alive" type="number" min={0} max={record.eggCount ?? 30} required value={alive} onChange={(e) => setAlive(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="e-dead">Tot</Label>
                  <Input id="e-dead" type="number" min={0} max={record.eggCount ?? 30} value={dead} onChange={(e) => setDead(e.target.value)} />
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={createYoung} onChange={(e) => setCreateYoung(e.target.checked)} />
                <span>Jungtiere als Tiere anlegen – mit Geburtstag, Mutter und Vater{record.motherName ? " und in der Gruppe der Mutter" : ""}.</span>
              </label>
            </>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-notes">Notiz</Label>
            <Textarea id="e-notes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button type="submit" disabled={end.isPending} className="gap-1.5">
            {end.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordCard({ farm, record, canWrite }: { farm: FarmSummary; record: BreedingRecord; canWrite: boolean }) {
  const { toast } = useToast();
  const refresh = useRefresh(farm);
  const [ending, setEnding] = useState<"born" | "failed" | null>(null);
  const remove = useDeleteBreeding({
    mutation: { onSuccess: refresh, onError: (err) => toast({ title: "Nicht gelöscht", description: errorText(err, ""), variant: "destructive" }) },
  });
  const running = record.status === "running";
  const hatch = record.kind === "incubation";
  const Icon = hatch ? Egg : Heart;
  const outcome = outcomeText(record);

  return (
    <li className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm" data-testid={`breeding-${record.id}`}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{breedingTitle(record)}</h3>
          <p className="text-xs text-muted-foreground">
            {SPECIES_LABELS[record.species]}
            {record.fatherName && ` · Vater: ${record.fatherName}`}
            {` · ${hatch ? "eingelegt" : "gedeckt"} am ${deDay(record.startedOn)}`}
          </p>
        </div>
      </div>

      {record.warning && (
        <p role="alert" className="flex gap-2 rounded-lg border border-red-600 bg-red-50 p-2 text-red-950 dark:bg-red-950/40 dark:text-red-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {record.warning}
        </p>
      )}

      {running ? (
        <>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>
                Tag {record.day} von {record.durationDays}
              </span>
              <span>
                {hatch ? "Schlupf" : "Geburt"} {deDay(record.dueOn)} ({deDay(record.earliestOn).slice(0, 6)}–{deDay(record.latestOn)})
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={`h-full ${record.late ? "bg-red-600" : "bg-primary"}`} style={{ width: `${progress(record) * 100}%` }} />
            </div>
          </div>
          {record.late && <p className="font-medium text-red-700 dark:text-red-300">Der Termin ist überschritten. Bitte den Tierarzt fragen – oder die Geburt eintragen.</p>}
          <ul className="space-y-1">
            {record.steps.map((s) => (
              <li key={s.on + s.text} className={`flex items-start gap-2 ${s.past ? "text-muted-foreground" : ""}`}>
                {s.past ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
                <span>
                  <span className="font-medium">{deDay(s.on)}</span> {s.text}
                </span>
              </li>
            ))}
          </ul>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="gap-1" onClick={() => setEnding("born")}>
                <Baby className="h-4 w-4" />
                {hatch ? "Schlupf eintragen" : "Geburt eintragen"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEnding("failed")}>
                {hatch ? "Brut abbrechen" : "Nicht trächtig"}
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="font-medium">{outcome}</p>
      )}

      {record.notes && <p className="whitespace-pre-wrap text-muted-foreground">{record.notes}</p>}

      {canWrite && !running && (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
          onClick={() => window.confirm("Eintrag löschen? Angelegte Jungtiere bleiben.") && remove.mutate({ farmId: farm.id, recordId: record.id })}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Löschen
        </button>
      )}
      {ending && <EndDialog farm={farm} record={record} outcome={ending} onClose={() => setEnding(null)} />}
    </li>
  );
}

function Breeding({ farm }: { farm: FarmSummary }) {
  const list = useListBreeding(farm.id);
  const [adding, setAdding] = useState(false);
  const canWrite = farm.role !== "guest";
  if (!list.data) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  const running = list.data.filter((r) => r.status === "running");
  const done = list.data.filter((r) => r.status !== "running");

  return (
    <div className="space-y-5">
      {canWrite && (
        <Button className="gap-1.5" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          Deckung oder Brut eintragen
        </Button>
      )}
      {list.data.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Noch nichts eingetragen. Mit dem Deck- oder Einlegedatum rechnet die App den Geburts- oder Schlupftermin aus und erinnert per Push an Schieren, Nestbox, Trockenstellen und Co.
        </p>
      )}
      {running.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Läuft</h2>
          <ul className="space-y-3">
            {running.map((r) => (
              <RecordCard key={r.id} farm={farm} record={r} canWrite={canWrite} />
            ))}
          </ul>
        </section>
      )}
      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Abgeschlossen</h2>
          <ul className="space-y-3">
            {done.map((r) => (
              <RecordCard key={r.id} farm={farm} record={r} canWrite={canWrite} />
            ))}
          </ul>
        </section>
      )}
      {adding && <NewDialog farm={farm} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** /farm/zucht – matings and clutches with their dates, steps and births. */
export default function ZuchtPage() {
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
          <Baby className="h-6 w-6 text-primary" />
          Zucht
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Trächtigkeit und Brut im Blick: Termin, Schritte bis dahin und die Jungtiere mit ihren Eltern. Die Tage sind Durchschnittswerte – jedes Tier ist anders.
        </p>
      </div>
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Breeding farm={farm} />}
    </div>
  );
}
