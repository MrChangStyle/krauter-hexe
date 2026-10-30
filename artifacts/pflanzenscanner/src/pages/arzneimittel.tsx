import { useEffect, useState, type ComponentProps, type FormEvent } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import {
  getListMedicinesQueryKey,
  useCreateMedicine,
  useDeleteMedicine,
  useEnsureOwnFarm,
  useListMedicines,
  useUpdateMedicine,
  type FarmSummary,
  type Medicine,
  type MedicineInput,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { MEDICINE_STATUS, deDay, medicineWithdrawal } from "@/lib/medicine-labels";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

interface Form {
  name: string;
  activeIngredient: string;
  unit: string;
  amount: string;
  batch: string;
  expiresOn: string;
  meat: string;
  milk: string;
  eggs: string;
  vet: string;
  receivedOn: string;
  notes: string;
}

const EMPTY: Form = { name: "", activeIngredient: "", unit: "ml", amount: "", batch: "", expiresOn: "", meat: "", milk: "", eggs: "", vet: "", receivedOn: "", notes: "" };
const str = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

function toForm(m: Medicine): Form {
  return {
    name: m.name,
    activeIngredient: m.activeIngredient ?? "",
    unit: m.unit,
    amount: str(m.amount),
    batch: m.batch ?? "",
    expiresOn: m.expiresOn ?? "",
    meat: str(m.withdrawalMeatDays),
    milk: str(m.withdrawalMilkDays),
    eggs: str(m.withdrawalEggsDays),
    vet: m.vet ?? "",
    receivedOn: m.receivedOn ?? "",
    notes: m.notes ?? "",
  };
}

function toInput(f: Form): MedicineInput | string {
  const amount = Number(f.amount.replace(",", "."));
  if (!f.name.trim() || !f.unit.trim()) return "Bitte Name und Einheit angeben.";
  if (!Number.isFinite(amount) || amount < 0) return "Bitte die Menge als Zahl angeben.";
  const days = (s: string) => (s.trim() === "" ? null : Number(s));
  const wait = [days(f.meat), days(f.milk), days(f.eggs)];
  if (wait.some((d) => d !== null && (!Number.isInteger(d) || d < 0 || d > 999))) return "Wartezeiten in ganzen Tagen (0–999).";
  return {
    name: f.name.trim(),
    activeIngredient: f.activeIngredient.trim() || null,
    unit: f.unit.trim(),
    amount,
    batch: f.batch.trim() || null,
    expiresOn: f.expiresOn || null,
    withdrawalMeatDays: wait[0],
    withdrawalMilkDays: wait[1],
    withdrawalEggsDays: wait[2],
    vet: f.vet.trim() || null,
    receivedOn: f.receivedOn || null,
    notes: f.notes.trim() || null,
  };
}

function MedicineDialog({ farmId, medicine, onClose }: { farmId: number; medicine: Medicine | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<Form>(medicine ? toForm(medicine) : EMPTY);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof Form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const done = (message: string) => () => {
    void queryClient.invalidateQueries({ queryKey: getListMedicinesQueryKey(farmId) });
    toast({ title: message });
    onClose();
  };
  const fail = (err: unknown) => setError(errorText(err, "Das hat nicht geklappt."));
  const create = useCreateMedicine({ mutation: { onSuccess: done("Mittel eingetragen"), onError: fail } });
  const update = useUpdateMedicine({ mutation: { onSuccess: done("Gespeichert"), onError: fail } });
  const remove = useDeleteMedicine({ mutation: { onSuccess: done("Gelöscht"), onError: fail } });
  const busy = create.isPending || update.isPending || remove.isPending;

  function submit(event: FormEvent, archived?: boolean) {
    event.preventDefault();
    const input = toInput(form);
    if (typeof input === "string") return setError(input);
    setError(null);
    if (medicine) update.mutate({ farmId, medicineId: medicine.id, data: { ...input, archived: archived ?? null } });
    else create.mutate({ farmId, data: input });
  }

  const field = (key: keyof Form, label: string, props: Partial<ComponentProps<typeof Input>> = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`medicine-${key}`}>{label}</Label>
      <Input id={`medicine-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} {...props} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{medicine ? medicine.name : "Mittel eintragen"}</DialogTitle>
            <DialogDescription>Angaben von Packung und Beipackzettel. Die Wartezeiten übernimmt die Krankenakte passend zur Tierart.</DialogDescription>
          </DialogHeader>
          {field("name", "Name *", { required: true, maxLength: 100, placeholder: "z. B. Flubenol" })}
          {field("activeIngredient", "Wirkstoff", { maxLength: 100 })}
          <div className="grid grid-cols-2 gap-3">
            {field("amount", "Menge *", { required: true, inputMode: "decimal" })}
            {field("unit", "Einheit *", { required: true, maxLength: 20, placeholder: "ml, g, Stück" })}
            {field("batch", "Charge", { maxLength: 50 })}
            {field("expiresOn", "Haltbar bis", { type: "date" })}
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Wartezeit in Tagen</p>
            <div className="grid grid-cols-3 gap-3">
              {field("meat", "Fleisch", { inputMode: "numeric" })}
              {field("milk", "Milch", { inputMode: "numeric" })}
              {field("eggs", "Eier", { inputMode: "numeric" })}
            </div>
            <p className="text-xs text-muted-foreground">Leer lassen, wenn das Mittel für das Lebensmittel nicht zugelassen ist – dann den Tierarzt fragen.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("vet", "Verschrieben von", { maxLength: 100 })}
            {field("receivedOn", "Erhalten am", { type: "date" })}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="medicine-notes">Notizen</Label>
            <Textarea id="medicine-notes" rows={2} maxLength={1000} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="z. B. Dosierung laut Tierarzt, Lagerung im Kühlschrank" />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="flex-wrap gap-2">
            {medicine && !medicine.archived && (
              <Button type="button" variant="outline" disabled={busy} onClick={(e) => submit(e as unknown as FormEvent, true)}>
                Aufgebraucht / entsorgt
              </Button>
            )}
            {medicine?.archived && (
              <Button type="button" variant="outline" disabled={busy} onClick={(e) => submit(e as unknown as FormEvent, false)}>
                Wieder in den Vorrat
              </Button>
            )}
            {medicine && medicine.uses === 0 && (
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => remove.mutate({ farmId, medicineId: medicine.id })}>
                Löschen
              </Button>
            )}
            <Button type="submit" disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Stock({ farm }: { farm: FarmSummary }) {
  const medicines = useListMedicines(farm.id);
  const [editing, setEditing] = useState<Medicine | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const canWrite = farm.role !== "guest";
  if (!medicines.data) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  const active = medicines.data.filter((m) => !m.archived);
  const archived = medicines.data.filter((m) => m.archived);

  const card = (m: Medicine) => (
    <li key={m.id}>
      <button
        type="button"
        disabled={!canWrite}
        onClick={() => setEditing(m)}
        className="w-full space-y-1 rounded-xl border bg-card p-3 text-left text-sm hover:bg-muted/50 disabled:hover:bg-card"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="font-medium">
            {m.name}
            {m.activeIngredient && <span className="font-normal text-muted-foreground"> · {m.activeIngredient}</span>}
          </span>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", MEDICINE_STATUS[m.status].tone)}>{MEDICINE_STATUS[m.status].label}</span>
        </span>
        <span className="block text-muted-foreground">
          {m.amount.toLocaleString("de-DE")} {m.unit}
          {m.batch && ` · Ch. ${m.batch}`}
          {m.expiresOn && ` · haltbar bis ${deDay(m.expiresOn)}`}
        </span>
        {medicineWithdrawal(m) && <span className="block text-xs text-muted-foreground">Wartezeit: {medicineWithdrawal(m)}</span>}
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      {canWrite && (
        <Button className="gap-1.5" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" />
          Mittel eintragen
        </Button>
      )}
      {active.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Noch nichts im Vorrat. Eingetragene Mittel lassen sich in der Krankenakte auswählen – Menge, Charge und Wartezeit kommen dann von selbst.
        </p>
      ) : (
        <ul className="space-y-2">{active.map(card)}</ul>
      )}
      {archived.length > 0 && (
        <div className="space-y-2">
          <button type="button" className="text-sm text-muted-foreground underline" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "Aufgebrauchte ausblenden" : `Aufgebraucht oder entsorgt (${archived.length})`}
          </button>
          {showArchived && <ul className="space-y-2 opacity-70">{archived.map(card)}</ul>}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Abgelaufene Mittel nicht mehr verwenden und über Apotheke oder Tierarzt entsorgen. Vor dem Ablauf erinnert die App per Push (30 Tage vorher und am Tag).
      </p>
      {editing && <MedicineDialog farmId={farm.id} medicine={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** /farm/arzneimittel – Arzneimittel-Vorrat of the active farm. */
export default function ArzneimittelPage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="arzneimittel" subtitle="Was im Schrank steht, wie lange es haltbar ist und welche Wartezeit gilt." />
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Stock farm={farm} />}
    </div>
  );
}
