import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Sprout, Trash2 } from "lucide-react";
import {
  getListFertilizingsQueryKey,
  useAddFertilizing,
  useGetFarmFarming,
  useListFertilizings,
  useListHerds,
  useRemoveFertilizing,
  type FertilizerKind,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { deDate } from "@/lib/farm-health";
import { certified, organicAdvice } from "@/lib/farming-labels";
import { FERTILIZER_LABELS, FERTILIZER_ORDER, MANURE_KG_PER_M2, manureEstimate } from "@/lib/fertilizing";
import { todayIso } from "@/lib/farm-labels";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";
const num = (n: number) => n.toLocaleString("de-DE");

/**
 * Düngung (docs/bio.md, B7) on the bed page: what went onto the bed, and the
 * Kreislauf Stall → Beet – how much manure the farm's own animals give.
 */
export function BedFertilizingCard({ farmId, bedId, canWrite }: { farmId: number; bedId: number; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const list = useListFertilizings(farmId);
  const farming = useGetFarmFarming(farmId);
  const herds = useListHerds(farmId);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ date: todayIso(), kind: "compost" as FertilizerKind, label: "", amountKg: "" });
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListFertilizingsQueryKey(farmId) });
  const add = useAddFertilizing({
    mutation: {
      onSuccess() {
        void refresh();
        setAdding(false);
        setForm((f) => ({ ...f, label: "", amountKg: "" }));
      },
      onError: () => toast({ title: "Nicht gespeichert", description: "Datum und Menge prüfen.", variant: "destructive" }),
    },
  });
  const remove = useRemoveFertilizing({ mutation: { onSuccess: () => void refresh() } });

  const entries = (list.data ?? []).filter((f) => f.bedId === bedId);
  const level = farming.data?.level;
  // Natural and organic farms are not offered mineral fertiliser first; organic ones get a warning.
  const kinds: FertilizerKind[] = organicAdvice(level) ? [...FERTILIZER_ORDER.filter((k) => k !== "mineral"), "mineral"] : FERTILIZER_ORDER;
  const manure = herds.data ? manureEstimate(herds.data) : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const amount = form.amountKg.trim() ? Number(form.amountKg.replace(",", ".")) : null;
    add.mutate({ farmId, bedId, data: { date: form.date, kind: form.kind, label: form.label.trim() || null, amountKg: amount } });
  }

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 text-sm" data-testid="bed-fertilizing">
      <h2 className="flex items-center gap-2 font-semibold">
        <Sprout className="h-4 w-4 text-primary" />
        Düngung
      </h2>
      {entries.length === 0 ? (
        <p className="text-muted-foreground">Noch nichts eingetragen – Kompost, Mist, Gründüngung …</p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.slice(0, 8).map((f) => (
            <li key={f.id} className="flex items-start gap-2 py-2" data-testid={`fertilizing-${f.id}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {FERTILIZER_LABELS[f.kind]}
                  {f.amountKg != null && <span className="font-normal text-muted-foreground"> · {num(f.amountKg)} kg</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {deDate(f.date)}
                  {f.label && ` · ${f.label}`}
                </p>
              </div>
              {canWrite && (
                <button type="button" className="p-1 text-muted-foreground hover:text-destructive" aria-label="Eintrag löschen" onClick={() => remove.mutate({ farmId, fertilizingId: f.id })}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && !adding && (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          Düngung eintragen
        </Button>
      )}
      {canWrite && adding && (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-border p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fz-date">Datum</Label>
              <Input id="fz-date" type="date" max={todayIso()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fz-kg">Menge (kg)</Label>
              <Input id="fz-kg" inputMode="decimal" placeholder="optional" value={form.amountKg} onChange={(e) => setForm({ ...form, amountKg: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fz-kind">Was</Label>
            <select id="fz-kind" className={selectClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as FertilizerKind })}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {FERTILIZER_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          {form.kind === "mineral" && certified(level) && (
            <p className="rounded-md bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200" data-testid="mineral-warning">
              Mineralischer Stickstoffdünger ist im Ökolandbau nicht zugelassen – der Bio-Check zeigt das rot.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fz-label">Bezeichnung</Label>
            <Input id="fz-label" maxLength={80} placeholder="z. B. Pferdemist vom Nachbarn, Phacelia" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={add.isPending || !form.date}>
              {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Speichern
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Abbrechen
            </Button>
          </div>
        </form>
      )}

      {manure && (
        <p className="rounded-md bg-primary/5 p-2 text-xs text-muted-foreground" data-testid="manure-estimate">
          Kreislauf Stall → Beet: Deine Tiere geben etwa {num(manure.kg)} kg Mist im Jahr – gut verrottet genug für rund {num(manure.m2)} m² Beet bei {MANURE_KG_PER_M2} kg je m² (Richtwerte).
        </p>
      )}
    </section>
  );
}
