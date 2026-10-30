import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Droplets, Hexagon, Loader2, Pencil, Search, ShieldPlus, Trash2 } from "lucide-react";
import {
  getGetBeeColonyQueryKey,
  getGetBeeOverviewQueryKey,
  getListMedicinesQueryKey,
  useAddBeeFeeding,
  useAddBeeHoney,
  useAddBeeInspection,
  useAddBeeTreatment,
  useDeleteBeeColony,
  useDeleteBeeEntry,
  useEnsureOwnFarm,
  useGetBeeColony,
  useListMedicines,
  useUpdateBeeColony,
  type BeeColony,
  type BeeColonyDetail,
  type BeeColonyStatus,
  type BeeEntryKind,
  type BeeFeedKind,
  type FarmSummary,
  type VarroaMethod,
} from "@workspace/api-client-react";
import { DictateButton } from "@/components/dictate-button";
import { BeeColonyPhoto } from "@/components/bee-colony-photo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { COLONY_STATUS, FEED_KINDS, HIVE_TYPES, TEMPER, VARROA_METHODS, queenColor } from "@/lib/bee-labels";
import { todayIso } from "@/lib/farm-labels";
import { deDay } from "@/lib/medicine-labels";
import { num } from "@/lib/yield-labels";
import { BeeHintLine, QueenDot } from "@/pages/bienen";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

/** "3,5" → 3.5; empty → null. */
function decimal(raw: string): number | null {
  const v = raw.trim().replace(",", ".");
  return v === "" ? null : Number(v);
}
function whole(raw: string): number | null {
  return raw.trim() === "" ? null : Number(raw);
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

type Tab = "inspection" | "feeding" | "treatment" | "honey";
const TABS: { id: Tab; label: string }[] = [
  { id: "inspection", label: "Durchsicht" },
  { id: "feeding", label: "Füttern" },
  { id: "treatment", label: "Varroa" },
  { id: "honey", label: "Honig" },
];

function useDone(farm: FarmSummary, colonyId: number, after: () => void) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return {
    onSuccess(detail: BeeColonyDetail) {
      queryClient.setQueryData(getGetBeeColonyQueryKey(farm.id, colonyId), detail);
      void queryClient.invalidateQueries({ queryKey: getGetBeeOverviewQueryKey(farm.id) });
      void queryClient.invalidateQueries({ queryKey: getListMedicinesQueryKey(farm.id) });
      toast({ title: "Eingetragen" });
      after();
    },
    onError: (err: unknown) => toast({ title: "Nicht eingetragen", description: errorText(err, ""), variant: "destructive" }),
  };
}

function InspectionForm({ farm, colonyId }: { farm: FarmSummary; colonyId: number }) {
  const [date, setDate] = useState(todayIso());
  const [beeFrames, setBeeFrames] = useState("");
  const [broodFrames, setBroodFrames] = useState("");
  const [queenSeen, setQueenSeen] = useState(false);
  const [eggsSeen, setEggsSeen] = useState(false);
  const [queenCells, setQueenCells] = useState("");
  const [temper, setTemper] = useState("");
  const [foodKg, setFoodKg] = useState("");
  const [mites, setMites] = useState("");
  const [notes, setNotes] = useState("");
  const add = useAddBeeInspection({
    mutation: useDone(farm, colonyId, () => {
      setBeeFrames("");
      setBroodFrames("");
      setQueenSeen(false);
      setEggsSeen(false);
      setQueenCells("");
      setTemper("");
      setFoodKg("");
      setMites("");
      setNotes("");
    }),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate({
      farmId: farm.id,
      colonyId,
      data: {
        date,
        beeFrames: whole(beeFrames),
        broodFrames: whole(broodFrames),
        queenSeen,
        eggsSeen,
        queenCells: whole(queenCells),
        temper: temper ? Number(temper) : null,
        foodKg: decimal(foodKg),
        mitesPerDay: decimal(mites),
        notes: notes || null,
      },
    });
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Field id="in-date" label="Datum">
          <Input id="in-date" type="date" required max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field id="in-frames" label="Waben besetzt">
          <Input id="in-frames" type="number" min={0} max={40} inputMode="numeric" value={beeFrames} onChange={(e) => setBeeFrames(e.target.value)} />
        </Field>
        <Field id="in-brood" label="Brutwaben">
          <Input id="in-brood" type="number" min={0} max={40} inputMode="numeric" value={broodFrames} onChange={(e) => setBroodFrames(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={queenSeen} onChange={(e) => setQueenSeen(e.target.checked)} className="h-4 w-4" />
          Königin gesehen
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={eggsSeen} onChange={(e) => setEggsSeen(e.target.checked)} className="h-4 w-4" />
          Stifte (Eier) gesehen
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id="in-cells" label="Weiselzellen">
          <Input id="in-cells" type="number" min={0} max={99} inputMode="numeric" value={queenCells} onChange={(e) => setQueenCells(e.target.value)} />
        </Field>
        <Field id="in-temper" label="Sanftmut">
          <select id="in-temper" className={selectClass} value={temper} onChange={(e) => setTemper(e.target.value)}>
            <option value="">–</option>
            {[1, 2, 3, 4].map((t) => (
              <option key={t} value={t}>
                {t} – {TEMPER[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="in-food" label="Futter (kg, geschätzt)">
          <Input id="in-food" inputMode="decimal" value={foodKg} onChange={(e) => setFoodKg(e.target.value)} />
        </Field>
        <Field id="in-mites" label="Milbenfall je Tag">
          <Input id="in-mites" inputMode="decimal" value={mites} onChange={(e) => setMites(e.target.value)} placeholder="Windel" />
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="in-notes">Notiz</Label>
          <DictateButton value={notes} onChange={setNotes} max={1000} />
        </div>
        <Input id="in-notes" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button type="submit" size="sm" disabled={add.isPending}>
        Durchsicht eintragen
      </Button>
    </form>
  );
}

function FeedingForm({ farm, colonyId }: { farm: FarmSummary; colonyId: number }) {
  const [date, setDate] = useState(todayIso());
  const [kind, setKind] = useState<BeeFeedKind>("sirup");
  const [amount, setAmount] = useState("");
  const add = useAddBeeFeeding({ mutation: useDone(farm, colonyId, () => setAmount("")) });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate({ farmId: farm.id, colonyId, data: { date, kind, amountKg: decimal(amount) ?? 0 } });
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-3 gap-3">
        <Field id="fe-date" label="Datum">
          <Input id="fe-date" type="date" required max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field id="fe-kind" label="Futter">
          <select id="fe-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as BeeFeedKind)}>
            {(Object.keys(FEED_KINDS) as BeeFeedKind[]).map((k) => (
              <option key={k} value={k}>
                {FEED_KINDS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="fe-amount" label="Menge (kg)">
          <Input id="fe-amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" size="sm" disabled={add.isPending}>
        Fütterung eintragen
      </Button>
    </form>
  );
}

function TreatmentForm({ farm, colonyId }: { farm: FarmSummary; colonyId: number }) {
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState<VarroaMethod>("ameisensaeure");
  const [medicineId, setMedicineId] = useState("");
  const [dose, setDose] = useState("");
  const [product, setProduct] = useState("");
  const medicines = (useListMedicines(farm.id).data ?? []).filter((m) => !m.archived && m.status !== "expired");
  const chosen = medicines.find((m) => String(m.id) === medicineId) ?? null;
  const add = useAddBeeTreatment({ mutation: useDone(farm, colonyId, () => setDose("")) });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate({ farmId: farm.id, colonyId, data: { date, method, medicineId: chosen?.id ?? null, dose: decimal(dose), product: product || null } });
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field id="tr-date" label="Datum">
          <Input id="tr-date" type="date" required max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field id="tr-method" label="Behandlung">
          <select id="tr-method" className={selectClass} value={method} onChange={(e) => setMethod(e.target.value as VarroaMethod)}>
            {(Object.keys(VARROA_METHODS) as VarroaMethod[]).map((k) => (
              <option key={k} value={k}>
                {VARROA_METHODS[k]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {method !== "drohnenbrut" && (
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          {medicines.length > 0 ? (
            <Field id="tr-stock" label="Aus dem Arzneimittel-Vorrat">
              <select id="tr-stock" className={selectClass} value={medicineId} onChange={(e) => setMedicineId(e.target.value)}>
                <option value="">– nicht aus dem Vorrat –</option>
                {medicines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.amount.toLocaleString("de-DE")} {m.unit})
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field id="tr-product" label="Mittel">
              <Input id="tr-product" maxLength={100} value={product} onChange={(e) => setProduct(e.target.value)} placeholder="z. B. Ameisensäure 60 %" />
            </Field>
          )}
          <Field id="tr-dose" label={`Menge${chosen ? ` (${chosen.unit})` : ""}`}>
            <Input id="tr-dose" inputMode="decimal" required={!!chosen} value={dose} onChange={(e) => setDose(e.target.value)} />
          </Field>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {chosen ? `Charge ${chosen.batch ?? "–"} · die Menge geht vom Vorrat ab. ` : ""}Den Milbenfall trägst du bei der Durchsicht ein. Behandlungen stehen im Bestandsbuch.
      </p>
      <Button type="submit" size="sm" disabled={add.isPending}>
        Behandlung eintragen
      </Button>
    </form>
  );
}

function HoneyForm({ farm, colonyId }: { farm: FarmSummary; colonyId: number }) {
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const add = useAddBeeHoney({ mutation: useDone(farm, colonyId, () => setAmount("")) });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate({ farmId: farm.id, colonyId, data: { date, amountKg: decimal(amount) ?? 0, note: note || null } });
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-3 gap-3">
        <Field id="ho-date" label="Datum">
          <Input id="ho-date" type="date" required max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field id="ho-amount" label="Honig (kg)">
          <Input id="ho-amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field id="ho-note" label="Sorte">
          <Input id="ho-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Frühtracht" />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">Der Honig erscheint auch unter Ertrag & Bilanz.</p>
      <Button type="submit" size="sm" disabled={add.isPending}>
        Honig eintragen
      </Button>
    </form>
  );
}

function EditDialog({ farm, colony, open, onOpenChange }: { farm: FarmSummary; colony: BeeColony; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({
    name: colony.name,
    apiary: colony.apiary ?? "",
    hiveType: colony.hiveType ?? "",
    queenYear: colony.queenYear ? String(colony.queenYear) : "",
    queenMarked: colony.queenMarked,
    queenOrigin: colony.queenOrigin ?? "",
    status: colony.status,
    notes: colony.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const update = useUpdateBeeColony({
    mutation: {
      onSuccess(detail) {
        queryClient.setQueryData(getGetBeeColonyQueryKey(farm.id, colony.id), detail);
        void queryClient.invalidateQueries({ queryKey: getGetBeeOverviewQueryKey(farm.id) });
        onOpenChange(false);
      },
      onError: (err) => setError(errorText(err, "Das hat nicht geklappt.")),
    },
  });
  const remove = useDeleteBeeColony({
    mutation: {
      onSuccess() {
        void queryClient.invalidateQueries({ queryKey: getGetBeeOverviewQueryKey(farm.id) });
        setLocation("/farm/bienen");
      },
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            update.mutate({
              farmId: farm.id,
              colonyId: colony.id,
              data: {
                name: form.name,
                apiary: form.apiary || null,
                hiveType: form.hiveType || null,
                queenYear: form.queenYear ? Number(form.queenYear) : null,
                queenMarked: form.queenMarked,
                queenOrigin: form.queenOrigin || null,
                status: form.status,
                startedOn: colony.startedOn,
                endedOn: form.status === colony.status ? colony.endedOn : null,
                notes: form.notes || null,
              },
            });
          }}
          className="space-y-3"
        >
          <DialogHeader>
            <DialogTitle>Volk bearbeiten</DialogTitle>
          </DialogHeader>
          <Field id="ed-name" label="Name *">
            <Input id="ed-name" required maxLength={60} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="ed-apiary" label="Bienenstand">
              <Input id="ed-apiary" maxLength={80} value={form.apiary} onChange={(e) => set("apiary", e.target.value)} />
            </Field>
            <Field id="ed-hive" label="Beute">
              <Input id="ed-hive" list="ed-hives" maxLength={40} value={form.hiveType} onChange={(e) => set("hiveType", e.target.value)} />
              <datalist id="ed-hives">
                {HIVE_TYPES.map((h) => (
                  <option key={h} value={h} />
                ))}
              </datalist>
            </Field>
            <Field id="ed-queen" label="Königin (Jahr)">
              <Input id="ed-queen" type="number" min={2000} max={new Date().getFullYear()} value={form.queenYear} onChange={(e) => set("queenYear", e.target.value)} />
            </Field>
            <Field id="ed-origin" label="Herkunft">
              <Input id="ed-origin" maxLength={80} value={form.queenOrigin} onChange={(e) => set("queenOrigin", e.target.value)} placeholder="Nachzucht, gekauft …" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.queenMarked} onChange={(e) => set("queenMarked", e.target.checked)} className="h-4 w-4" />
            Königin gezeichnet{form.queenYear ? ` (${queenColor(Number(form.queenYear)).name})` : ""}
          </label>
          <Field id="ed-status" label="Status">
            <select id="ed-status" className={selectClass} value={form.status} onChange={(e) => set("status", e.target.value as BeeColonyStatus)}>
              {(Object.keys(COLONY_STATUS) as BeeColonyStatus[]).map((s) => (
                <option key={s} value={s}>
                  {COLONY_STATUS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="ed-notes" label="Notizen">
            <Input id="ed-notes" maxLength={1000} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            {farm.role === "admin" && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto gap-1.5 text-destructive hover:text-destructive"
                onClick={() => window.confirm("Dieses Volk mit seiner Stockkarte löschen? Der Honig bleibt unter Ertrag.") && remove.mutate({ farmId: farm.id, colonyId: colony.id })}
              >
                <Trash2 className="h-4 w-4" />
                Löschen
              </Button>
            )}
            <Button type="submit" disabled={update.isPending}>
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface HistoryEntry {
  kind: BeeEntryKind;
  id: number;
  date: string;
  title: string;
  text: string;
  icon: ReactNode;
}

function history(d: BeeColonyDetail): HistoryEntry[] {
  const entries: HistoryEntry[] = [
    ...d.inspections.map((i) => ({
      kind: "inspections" as const,
      id: i.id,
      date: i.date,
      title: "Durchsicht",
      icon: <Search className="h-4 w-4 text-primary" />,
      text: [
        i.beeFrames !== null ? `${i.beeFrames} Waben` : null,
        i.broodFrames !== null ? `${i.broodFrames} Brutwaben` : null,
        i.queenSeen ? "Königin gesehen" : null,
        i.eggsSeen ? "Stifte" : null,
        i.queenCells ? `${i.queenCells} Weiselzellen` : null,
        i.temper ? TEMPER[i.temper] : null,
        i.foodKg !== null ? `${num(i.foodKg)} kg Futter` : null,
        i.mitesPerDay !== null ? `${num(i.mitesPerDay)} Milben/Tag` : null,
        i.notes,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    ...d.feedings.map((f) => ({ kind: "feedings" as const, id: f.id, date: f.date, title: "Fütterung", icon: <Droplets className="h-4 w-4 text-sky-600 dark:text-sky-400" />, text: `${num(f.amountKg)} kg ${FEED_KINDS[f.kind]}` })),
    ...d.treatments.map((t) => ({
      kind: "treatments" as const,
      id: t.id,
      date: t.date,
      title: `Varroa: ${VARROA_METHODS[t.method]}`,
      icon: <ShieldPlus className="h-4 w-4 text-red-600 dark:text-red-400" />,
      text: [t.product, t.dose !== null ? `${num(t.dose)} ${t.unit ?? ""}`.trim() : null, t.batch ? `Charge ${t.batch}` : null, t.notes].filter(Boolean).join(" · "),
    })),
    ...d.honey.map((h) => ({ kind: "honey" as const, id: h.id, date: h.date, title: "Honig", icon: <Hexagon className="h-4 w-4 text-amber-500" />, text: `${num(h.amountKg)} kg${h.note ? ` · ${h.note}` : ""}` })),
  ];
  return entries.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function ColonyCardPage({ farm, colonyId }: { farm: FarmSummary; colonyId: number }) {
  const queryClient = useQueryClient();
  const detail = useGetBeeColony(farm.id, colonyId);
  const [tab, setTab] = useState<Tab>("inspection");
  const [editing, setEditing] = useState(false);
  const remove = useDeleteBeeEntry({
    mutation: {
      onSuccess(d) {
        queryClient.setQueryData(getGetBeeColonyQueryKey(farm.id, colonyId), d);
        void queryClient.invalidateQueries({ queryKey: getGetBeeOverviewQueryKey(farm.id) });
        void queryClient.invalidateQueries({ queryKey: getListMedicinesQueryKey(farm.id) });
      },
    },
  });
  if (detail.isLoading) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  const d = detail.data;
  if (!d) return <p className="text-sm text-muted-foreground">Dieses Volk gibt es nicht (mehr).</p>;
  const c = d.colony;
  const canWrite = farm.role !== "guest";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Hexagon className="h-6 w-6 text-amber-500" />
            {c.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[c.apiary, c.hiveType, c.status !== "active" ? `${COLONY_STATUS[c.status]}${c.endedOn ? ` seit ${deDay(c.endedOn)}` : ""}` : null].filter(Boolean).join(" · ") || "Ohne Stand"}
          </p>
          {c.queenYear !== null && (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <QueenDot year={c.queenYear} />
              Königin {c.queenYear}
              {c.queenMarked ? ", gezeichnet" : ""}
              {c.queenOrigin ? ` · ${c.queenOrigin}` : ""}
            </p>
          )}
        </div>
        {canWrite && (
          <button type="button" aria-label="Volk bearbeiten" className="rounded-md p-2 text-muted-foreground hover:bg-muted" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

      <BeeColonyPhoto farm={farm} colony={c} />

      {c.hints.length > 0 && (
        <ul className="space-y-2">
          {c.hints.map((h) => (
            <BeeHintLine key={h.kind} hint={h} />
          ))}
        </ul>
      )}

      {canWrite && c.status === "active" && (
        <section className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
          <div role="tablist" className="flex gap-1 rounded-lg bg-muted p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`flex-1 rounded-md px-2 py-1.5 ${tab === t.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === "inspection" && <InspectionForm farm={farm} colonyId={colonyId} />}
          {tab === "feeding" && <FeedingForm farm={farm} colonyId={colonyId} />}
          {tab === "treatment" && <TreatmentForm farm={farm} colonyId={colonyId} />}
          {tab === "honey" && <HoneyForm farm={farm} colonyId={colonyId} />}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Stockkarte</h2>
        {history(d).length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Einträge.</p>
        ) : (
          <ul className="divide-y divide-border text-sm" data-testid="bee-history">
            {history(d).map((e) => (
              <li key={`${e.kind}-${e.id}`} className="flex items-start gap-2.5 py-2">
                <span className="mt-0.5">{e.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block">
                    <span className="font-medium">{e.title}</span> <span className="text-muted-foreground">· {deDay(e.date)}</span>
                  </span>
                  {e.text && <span className="block text-xs text-muted-foreground">{e.text}</span>}
                </span>
                {canWrite && (
                  <button
                    type="button"
                    aria-label="Eintrag löschen"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => window.confirm("Diesen Eintrag löschen?") && remove.mutate({ farmId: farm.id, colonyId, kind: e.kind, entryId: e.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {editing && <EditDialog farm={farm} colony={c} open={editing} onOpenChange={setEditing} />}
    </div>
  );
}

/** /farm/bienen/:colonyId – a colony's hive card (docs/bienen.md). */
export default function BienenVolkPage() {
  const params = useParams<{ colonyId: string }>();
  const colonyId = Number(params.colonyId);
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/farm/bienen" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Bienen
      </Link>
      {!farm || !Number.isInteger(colonyId) ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <ColonyCardPage farm={farm} colonyId={colonyId} />}
    </div>
  );
}
