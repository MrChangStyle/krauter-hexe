import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, HeartPulse, Loader2, Plus, Scale, Trash2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  getGetFarmExportQueryKey,
  getListMedicalRecordsQueryKey,
  getListFarmTasksQueryKey,
  getListMedicinesQueryKey,
  getListWeightLogsQueryKey,
  useCreateMedicalRecord,
  useCreateWeightLog,
  useDeleteMedicalRecord,
  useDeleteWeightLog,
  useListMedicalRecords,
  useListMedicines,
  useListWeightLogs,
  useUpdateMedicalRecord,
  type MedicalRecord,
  type MedicalRecordInput,
  type TaskIntervalUnit,
  type WeightLog,
} from "@workspace/api-client-react";
import { DictateButton } from "@/components/dictate-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { todayIso } from "@/lib/farm-labels";
import { REPEAT_DEFAULTS, REPEAT_LABELS, guessRepeatKind, repeatDue, type RepeatKind } from "@/lib/medical-repeat";
import { medicineWithdrawal } from "@/lib/medicine-labels";
import {
  WEIGHT_LOSS_WINDOW_DAYS,
  activeWithdrawalEnd,
  dateRangeText,
  deDate,
  doseText,
  kg,
  weightWarning,
  withdrawalEnd,
} from "@/lib/farm-health";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

// ── Weight ───────────────────────────────────────────────────────────────────

function WeightChart({ logs }: { logs: WeightLog[] }) {
  const points = logs.map((l) => ({ t: new Date(`${l.date}T12:00:00`).getTime(), kg: l.weightKg, date: l.date }));
  return (
    <div className="h-44 w-full" role="img" aria-label="Gewichtsverlauf">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="0" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => new Date(t).toLocaleDateString("de-DE", { day: "numeric", month: "numeric" })}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            minTickGap={24}
          />
          <YAxis
            dataKey="kg"
            domain={[(min: number) => Math.floor(min * 0.95), (max: number) => Math.ceil(max * 1.05)]}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => v.toLocaleString("de-DE")}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as (typeof points)[number] | undefined) : undefined;
              if (!p) return null;
              return (
                <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm">
                  <div className="text-muted-foreground">{deDate(p.date)}</div>
                  <div className="font-medium">{kg(p.kg)}</div>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="kg"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 4, fill: "hsl(var(--primary))", stroke: "hsl(var(--card))", strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: "hsl(var(--card))", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeightSection({ farmId, animalId, canWrite }: { farmId: number; animalId: number; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logs = useListWeightLogs(farmId, animalId);
  const [date, setDate] = useState(todayIso());
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListWeightLogsQueryKey(farmId, animalId) });
  const create = useCreateWeightLog({
    mutation: {
      onSuccess() {
        setValue("");
        setError(null);
        void refresh();
      },
      onError: (err) => setError(errorText(err, "Das hat nicht geklappt.")),
    },
  });
  const remove = useDeleteWeightLog({
    mutation: {
      onSuccess: () => void refresh(),
      onError: () => toast({ title: "Nicht gelöscht", variant: "destructive" }),
    },
  });

  const all = logs.data ?? [];
  const warning = weightWarning(all);
  const newestFirst = [...all].reverse();
  const shown = showAll ? newestFirst : newestFirst.slice(0, 3);

  function submit(event: FormEvent) {
    event.preventDefault();
    const weightKg = Number(value.replace(",", "."));
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      setError("Bitte gib das Gewicht in kg an.");
      return;
    }
    create.mutate({ farmId, animalId, data: { date, weightKg } });
  }

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-semibold">
        <Scale className="h-4 w-4 text-primary" />
        Gewicht
      </h2>

      {warning && (
        <div role="alert" className="flex gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p>
            <span className="font-semibold text-destructive">Gewichtsverlust {warning.lossPercent.toLocaleString("de-DE")} %</span>
            <br />
            {kg(warning.fromKg)} am {deDate(warning.fromDate)} → {kg(warning.toKg)} am {deDate(warning.toDate)} (mehr als 5 %
            in {WEIGHT_LOSS_WINDOW_DAYS} Tagen). Bitte das Tier beobachten und ggf. den Tierarzt fragen.
          </p>
        </div>
      )}

      {logs.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : all.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch kein Gewicht eingetragen.</p>
      ) : (
        <div className="rounded-xl border border-border bg-card p-2">
          {all.length >= 2 && <WeightChart logs={all} />}
          <ul className="divide-y divide-border text-sm">
            {shown.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-2 py-1.5">
                <span className="text-muted-foreground">{deDate(l.date)}</span>
                <span className="ml-auto font-medium tabular-nums">{kg(l.weightKg)}</span>
                {canWrite && (
                  <button
                    type="button"
                    aria-label={`Messung vom ${deDate(l.date)} löschen`}
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(`Messung vom ${deDate(l.date)} löschen?`)) remove.mutate({ farmId, weightId: l.id });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {all.length > 3 && (
            <button
              type="button"
              className="px-2 pt-1 text-xs text-muted-foreground underline underline-offset-4"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "Weniger anzeigen" : `Alle ${all.length} Messungen`}
            </button>
          )}
        </div>
      )}

      {canWrite && (
        <form onSubmit={submit} className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label htmlFor="weight-date" className="text-xs">Datum</Label>
            <Input id="weight-date" type="date" required max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex w-24 flex-col gap-1">
            <Label htmlFor="weight-kg" className="text-xs">kg</Label>
            <Input id="weight-kg" inputMode="decimal" required value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,0" />
          </div>
          <Button type="submit" disabled={create.isPending} className="gap-1.5">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Eintragen
          </Button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

// ── Health records ───────────────────────────────────────────────────────────

const EMPTY_RECORD: MedicalRecordInput = {
  date: "",
  diagnosis: "",
  treatment: "",
  medication: "",
  withdrawalPeriodDays: null,
  treatmentUntil: null,
  vet: "",
  notes: "",
  medicineId: null,
  dose: null,
};

function toRecordInput(r: MedicalRecord): MedicalRecordInput {
  return {
    date: r.date,
    diagnosis: r.diagnosis,
    treatment: r.treatment ?? "",
    medication: r.medication ?? "",
    withdrawalPeriodDays: r.withdrawalPeriodDays,
    treatmentUntil: r.treatmentUntil,
    vet: r.vet ?? "",
    notes: r.notes ?? "",
    medicineId: r.medicineId,
    dose: r.dose,
  };
}

function RecordDialog({
  farmId,
  animalId,
  record,
  open,
  onOpenChange,
}: {
  farmId: number;
  animalId: number;
  /** null: new record */
  record: MedicalRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MedicalRecordInput>(() =>
    record ? toRecordInput(record) : { ...EMPTY_RECORD, date: todayIso() },
  );
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof MedicalRecordInput>(key: K, value: MedicalRecordInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const { toast } = useToast();
  // Erinnerung (new records only): "auto" follows what was typed.
  const [repeatChoice, setRepeatChoice] = useState<RepeatKind | "none" | "auto">("auto");
  const [repeatEvery, setRepeatEvery] = useState("");
  const [repeatUnit, setRepeatUnit] = useState<TaskIntervalUnit | null>(null);
  const repeatKind = record ? null : repeatChoice === "auto" ? guessRepeatKind(form.diagnosis, form.treatment, form.medication) : repeatChoice === "none" ? null : repeatChoice;
  const every = repeatKind ? (repeatEvery === "" ? REPEAT_DEFAULTS[repeatKind].every : Number(repeatEvery)) : 0;
  const unit = repeatKind ? (repeatUnit ?? REPEAT_DEFAULTS[repeatKind].unit) : "Monate";
  const due = repeatKind && Number.isInteger(every) && every >= 1 && every <= 365 && form.date ? repeatDue(form.date, every, unit) : null;
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: getListMedicalRecordsQueryKey(farmId, animalId) });
    if (repeatKind) {
      void queryClient.invalidateQueries({ queryKey: getListFarmTasksQueryKey(farmId) });
      if (due) toast({ title: `Erinnerung am ${deDate(due)}`, description: `Stall-Aufgabe „${REPEAT_LABELS[repeatKind].task}“, um 8 Uhr.` });
    }
    void queryClient.invalidateQueries({ queryKey: getGetFarmExportQueryKey(farmId) });
    void queryClient.invalidateQueries({ queryKey: getListMedicinesQueryKey(farmId) });
    onOpenChange(false);
  };
  const fail = (err: unknown) => setError(errorText(err, "Das hat nicht geklappt."));
  const create = useCreateMedicalRecord({ mutation: { onSuccess: done, onError: fail } });
  const update = useUpdateMedicalRecord({ mutation: { onSuccess: done, onError: fail } });
  const remove = useDeleteMedicalRecord({ mutation: { onSuccess: done, onError: fail } });
  const busy = create.isPending || update.isPending || remove.isPending;
  const medicines = useListMedicines(farmId);
  // Typed text, so a decimal comma survives until saving.
  const [doseInput, setDoseInput] = useState(record?.dose == null ? "" : String(record.dose).replace(".", ","));
  // Offer what can still be used – and the one this record already uses.
  const offered = (medicines.data ?? []).filter((m) => m.id === form.medicineId || (!m.archived && m.status !== "expired"));
  const chosen = medicines.data?.find((m) => m.id === form.medicineId) ?? null;
  const formWaitEnd = form.date ? withdrawalEnd({ date: form.date, treatmentUntil: form.treatmentUntil ?? null, withdrawalPeriodDays: form.withdrawalPeriodDays ?? null }) : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const dose = form.medicineId != null ? Number(doseInput.replace(",", ".")) : null;
    if (dose !== null && !(dose > 0)) {
      setError(`Bitte die Menge in ${chosen?.unit ?? "der Einheit des Mittels"} angeben.`);
      return;
    }
    if (repeatKind && !due) {
      setError("Bitte einen Abstand zwischen 1 und 365 angeben.");
      return;
    }
    const data = { ...form, dose, repeat: repeatKind ? { kind: repeatKind, every, unit } : null };
    if (record) update.mutate({ farmId, recordId: record.id, data: { ...form, dose } });
    else create.mutate({ farmId, animalId, data });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{record ? "Eintrag bearbeiten" : "Neuer Eintrag"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="med-date">Datum *</Label>
              <Input id="med-date" type="date" required max={todayIso()} value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="med-until">Behandlung bis</Label>
              <Input
                id="med-until"
                type="date"
                min={form.date || undefined}
                value={form.treatmentUntil ?? ""}
                onChange={(e) => set("treatmentUntil", e.target.value === "" ? null : e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="med-wait">Wartezeit (Tage)</Label>
              <Input
                id="med-wait"
                type="number"
                min={0}
                max={999}
                value={form.withdrawalPeriodDays ?? ""}
                onChange={(e) => set("withdrawalPeriodDays", e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
            <p className="self-end pb-2 text-xs text-muted-foreground" data-testid="med-wait-end">
              {formWaitEnd ? `Wartezeit bis ${deDate(formWaitEnd)}` : "Zählt ab dem letzten Behandlungstag."}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="med-diagnosis">Diagnose / Anlass *</Label>
            <Input id="med-diagnosis" required maxLength={200} value={form.diagnosis} onChange={(e) => set("diagnosis", e.target.value)} placeholder="z. B. Entwurmung, Moderhinke" />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="med-treatment">Behandlung</Label>
              <DictateButton value={form.treatment ?? ""} onChange={(t) => set("treatment", t)} max={2000} label="Behandlung sprechen" />
            </div>
            <Textarea id="med-treatment" rows={2} maxLength={2000} value={form.treatment ?? ""} onChange={(e) => set("treatment", e.target.value)} />
          </div>
          {offered.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-border p-3">
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="med-stock">Aus dem Arzneimittel-Vorrat</Label>
                  <select
                    id="med-stock"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.medicineId ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, medicineId: e.target.value ? Number(e.target.value) : null }))}
                  >
                    <option value="">– nicht aus dem Vorrat –</option>
                    {offered.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.amount.toLocaleString("de-DE")} {m.unit})
                      </option>
                    ))}
                  </select>
                </div>
                {chosen && (
                  <div className="flex w-24 flex-col gap-1.5">
                    <Label htmlFor="med-dose">Menge ({chosen.unit})</Label>
                    <Input
                      id="med-dose"
                      inputMode="decimal"
                      value={doseInput}
                      onChange={(e) => setDoseInput(e.target.value)}
                    />
                  </div>
                )}
              </div>
              {chosen && (
                <p className="text-xs text-muted-foreground">
                  {[chosen.batch && `Charge ${chosen.batch}`, medicineWithdrawal(chosen) && `Wartezeit ${medicineWithdrawal(chosen)}`].filter(Boolean).join(" · ")}
                  {" – "}Medikament und Wartezeit leer lassen: werden passend zur Tierart übernommen; die Menge geht vom Vorrat ab.
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="med-medication">Medikament</Label>
              <Input id="med-medication" maxLength={200} value={form.medication ?? ""} placeholder={chosen?.name} onChange={(e) => set("medication", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="med-vet">Tierarzt</Label>
              <Input id="med-vet" maxLength={100} value={form.vet ?? ""} onChange={(e) => set("vet", e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="med-notes">Notizen</Label>
              <DictateButton value={form.notes ?? ""} onChange={(t) => set("notes", t)} max={2000} />
            </div>
            <Textarea id="med-notes" rows={2} maxLength={2000} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
          {!record && (
            <div className="space-y-2 rounded-lg border border-border p-3" data-testid="med-repeat">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="med-repeat">Erinnern zum Wiederholen</Label>
                <select
                  id="med-repeat"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={repeatKind ?? "none"}
                  onChange={(e) => setRepeatChoice(e.target.value as RepeatKind | "none")}
                >
                  <option value="none">Keine Erinnerung</option>
                  <option value="deworm">Entwurmung wiederholen</option>
                  <option value="vaccinate">Impfung auffrischen</option>
                </select>
              </div>
              {repeatKind && (
                <>
                  <div className="grid grid-cols-[5rem_1fr] gap-3">
                    <Input
                      aria-label="Abstand"
                      type="number"
                      min={1}
                      max={365}
                      value={repeatEvery === "" ? String(REPEAT_DEFAULTS[repeatKind].every) : repeatEvery}
                      onChange={(e) => setRepeatEvery(e.target.value)}
                    />
                    <select
                      aria-label="Einheit"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={unit}
                      onChange={(e) => setRepeatUnit(e.target.value as TaskIntervalUnit)}
                    >
                      <option value="Tage">Tage</option>
                      <option value="Wochen">Wochen</option>
                      <option value="Monate">Monate</option>
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {due ? `Erinnerung am ${deDate(due)} als Stall-Aufgabe „${REPEAT_LABELS[repeatKind].task}“. ` : ""}
                    Den richtigen Abstand legt ihr mit dem Tierarzt fest – bei Würmern am besten nach Kotprobe.
                  </p>
                </>
              )}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            {record && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto gap-1.5 text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Diesen Eintrag löschen? Er fehlt dann auch im Export.")) {
                    remove.mutate({ farmId, recordId: record.id });
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                Löschen
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={busy} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MedicalSection({ farmId, animalId, canWrite }: { farmId: number; animalId: number; canWrite: boolean }) {
  const records = useListMedicalRecords(farmId, animalId);
  // key forces a fresh form per opened record
  const [dialog, setDialog] = useState<{ record: MedicalRecord | null; key: number } | null>(null);
  const all = records.data ?? [];
  const today = todayIso();
  const waitUntil = activeWithdrawalEnd(all, today);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <HeartPulse className="h-4 w-4 text-primary" />
          Gesundheitsakte
        </h2>
        {canWrite && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog({ record: null, key: Date.now() })}>
            <Plus className="h-4 w-4" />
            Eintrag
          </Button>
        )}
      </div>

      {waitUntil && (
        <div role="status" className="flex gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            <span className="font-semibold">Wartezeit bis {deDate(waitUntil)}</span>
            <br />
            Milch, Eier und Fleisch dieses Tieres bis dahin nicht verwenden.
          </p>
        </div>
      )}

      {records.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : all.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Einträge – z. B. Impfungen, Entwurmungen, Behandlungen.</p>
      ) : (
        <ul className="space-y-2">
          {all.map((r) => {
            const end = withdrawalEnd(r);
            const body = (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 font-medium">{r.diagnosis}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">{dateRangeText(r)}</span>
                </div>
                {r.treatment && <p className="whitespace-pre-wrap text-muted-foreground">{r.treatment}</p>}
                {(r.medication || r.vet) && (
                  <p className="text-xs text-muted-foreground">
                    {[r.medication && `Medikament: ${r.medication}${doseText(r) ? ` (${doseText(r)})` : ""}`, r.vet && `Tierarzt: ${r.vet}`].filter(Boolean).join(" · ")}
                  </p>
                )}
                {end && (
                  <p className={end >= today ? "text-xs font-medium text-amber-700 dark:text-amber-400" : "text-xs text-muted-foreground"}>
                    Wartezeit {r.withdrawalPeriodDays} Tage, bis {deDate(end)}
                  </p>
                )}
                {r.notes && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{r.notes}</p>}
              </>
            );
            return (
              <li key={r.id}>
                {canWrite ? (
                  <button
                    type="button"
                    className="w-full space-y-1 rounded-xl border border-border bg-card p-3 text-left text-sm transition-colors hover:bg-muted/50"
                    onClick={() => setDialog({ record: r, key: Date.now() })}
                  >
                    {body}
                  </button>
                ) : (
                  <div className="space-y-1 rounded-xl border border-border bg-card p-3 text-sm">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {dialog && (
        <RecordDialog
          key={dialog.key}
          farmId={farmId}
          animalId={animalId}
          record={dialog.record}
          open
          onOpenChange={(o) => !o && setDialog(null)}
        />
      )}
    </section>
  );
}
