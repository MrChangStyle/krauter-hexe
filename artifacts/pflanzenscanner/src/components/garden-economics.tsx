import { useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, Coins, Info, Loader2, Trash2 } from "lucide-react";
import {
  getGetGardenEconomicsQueryKey,
  getGetYieldOverviewQueryKey,
  useAddGardenCost,
  useAddGardenHours,
  useDeleteGardenCost,
  useDeleteGardenHours,
  useGetGardenEconomics,
  useListBeds,
  type ExpenseCategory,
  type FarmSummary,
  type GardenEconomics as Economics,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { todayIso } from "@/lib/farm-labels";
import { deDay } from "@/lib/medicine-labels";
import { EXPENSE_LABELS, GARDEN_COST_CATEGORIES, euro, num } from "@/lib/yield-labels";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

function errorText(err: unknown): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? "Bitte versuche es gleich noch einmal.";
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** After a change: the economics and Ertrag & Bilanz (garden costs are farm expenses). */
function useRefresh(farm: FarmSummary, season: number) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: getGetGardenEconomicsQueryKey(farm.id, season) });
    void queryClient.invalidateQueries({ queryKey: getGetYieldOverviewQueryKey(farm.id, season) });
  };
}

/** A garden cost or hours – the season is the year of the date. */
function EntryDialog({ farm, season, kind, onClose }: { farm: FarmSummary; season: number; kind: "cost" | "hours"; onClose: () => void }) {
  const { toast } = useToast();
  const refresh = useRefresh(farm, season);
  const beds = useListBeds(farm.id);
  const thisYear = season === new Date().getFullYear();
  const [date, setDate] = useState(thisYear ? todayIso() : `${season}-06-01`);
  const [category, setCategory] = useState<ExpenseCategory>("seeds");
  const [amount, setAmount] = useState("");
  const [bedId, setBedId] = useState("");
  const [note, setNote] = useState("");
  const done = {
    onSuccess() {
      refresh();
      toast({ title: "Eingetragen" });
      onClose();
    },
    onError: (err: unknown) => toast({ title: "Nicht eingetragen", description: errorText(err), variant: "destructive" }),
  };
  const addCost = useAddGardenCost({ mutation: done });
  const addHours = useAddGardenHours({ mutation: done });
  const value = Number(amount.replace(",", "."));

  function submit(e: FormEvent) {
    e.preventDefault();
    const common = { date, bedId: bedId ? Number(bedId) : null, note: note.trim() || null };
    if (kind === "cost") addCost.mutate({ farmId: farm.id, data: { ...common, category, amountEur: value } });
    else addHours.mutate({ farmId: farm.id, data: { ...common, hours: value } });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{kind === "cost" ? "Gartenausgabe" : "Zeit im Garten"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {kind === "cost" ? (
              <Field id="ge-category" label="Wofür">
                <select id="ge-category" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                  {GARDEN_COST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field id="ge-hours" label="Stunden">
                <Input id="ge-hours" inputMode="decimal" required value={amount} placeholder="z. B. 1,5" onChange={(e) => setAmount(e.target.value)} />
              </Field>
            )}
            {kind === "cost" && (
              <Field id="ge-amount" label="Betrag €">
                <Input id="ge-amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
            )}
            <Field id="ge-date" label="Datum">
              <Input id="ge-date" type="date" required min={`${season}-01-01`} max={thisYear ? todayIso() : `${season}-12-31`} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field id="ge-bed" label="Beet (optional)">
              <select id="ge-bed" className={selectClass} value={bedId} onChange={(e) => setBedId(e.target.value)}>
                <option value="">Ganzer Garten</option>
                {(beds.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field id="ge-note" label="Notiz">
            <Input
              id="ge-note"
              maxLength={kind === "cost" ? 500 : 300}
              value={note}
              placeholder={kind === "cost" ? "z. B. 3 Sack Hochbeeterde" : "z. B. Jäten und Gießen"}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          {kind === "cost" && <p className="text-xs text-muted-foreground">Steht auch unter Ertrag & Bilanz als Ausgabe – sie zählt dort nur einmal.</p>}
          <Button type="submit" className="w-full" disabled={addCost.isPending || addHours.isPending || !(value > 0)}>
            Eintragen
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Tile({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold" data-testid={testId}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Entries({ farm, season, e, canWrite }: { farm: FarmSummary; season: number; e: Economics; canWrite: boolean }) {
  const refresh = useRefresh(farm, season);
  const removeCost = useDeleteGardenCost({ mutation: { onSuccess: refresh } });
  const removeHours = useDeleteGardenHours({ mutation: { onSuccess: refresh } });
  const rows = [
    ...e.costs.entries.map((c) => ({ key: `c${c.id}`, date: c.date, text: `${euro(c.amountEur)} ${EXPENSE_LABELS[c.category]}`, bed: c.bedName, note: c.note, remove: () => removeCost.mutate({ farmId: farm.id, costId: c.id }) })),
    ...e.hours.entries.map((h) => ({ key: `h${h.id}`, date: h.date, text: `${num(h.hours)} Std.`, bed: h.bedName, note: h.note, remove: () => removeHours.mutate({ farmId: farm.id, hoursId: h.id }) })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  if (rows.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">Ausgaben und Stunden {season} ({rows.length})</summary>
      <ul className="divide-y divide-border pt-2">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2 py-1.5">
            <span className="flex-1">
              {deDay(r.date)} · {r.text}
              {r.bed && ` · ${r.bed}`}
              {r.note && <span className="text-muted-foreground"> · {r.note}</span>}
            </span>
            {canWrite && (
              <button type="button" aria-label="Eintrag löschen" className="text-muted-foreground hover:text-destructive" onClick={() => window.confirm("Diesen Eintrag löschen?") && r.remove()}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Garten-Wirtschaftlichkeit (docs/garten-wirtschaftlichkeit.md) on the
 * Ernte-Auswertung: harvest value against garden costs and hours.
 */
export function GardenEconomicsSection({ farm, season }: { farm: FarmSummary; season: number }) {
  const query = useGetGardenEconomics(farm.id, season);
  const [dialog, setDialog] = useState<"cost" | "hours" | null>(null);
  const canWrite = farm.role !== "guest";
  const e = query.data;

  return (
    <section className="space-y-3" aria-label="Wirtschaftlichkeit">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Wirtschaftlichkeit</h2>
      {!e ? (
        query.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <p className="text-sm text-muted-foreground">Lässt sich gerade nicht laden.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Tile label="Ernte im Laden" value={euro(e.value)} sub={`${num(e.kg)} kg`} />
            <Tile label="Kosten" value={euro(e.costs.total)} sub={e.costPerKg !== null ? `${euro(e.costPerKg)} je kg` : undefined} />
            <Tile
              label="Überschuss"
              value={euro(e.surplus)}
              testId="economics-surplus"
              sub={e.previous ? `Vorjahr ${euro(e.previous.surplus)}` : e.surplusPerM2 !== null ? `${euro(e.surplusPerM2)} je m² Beet` : undefined}
            />
            <Tile
              label={e.hours.estimated ? "Je Stunde (geschätzt)" : "Je Stunde"}
              value={e.perHour !== null ? euro(e.perHour) : "–"}
              testId="economics-per-hour"
              sub={`${num(e.hours.total)} Std.${e.hours.estimated ? " geschätzt" : ""}`}
            />
          </div>
          {e.hints.length > 0 && (
            <ul className="space-y-1.5">
              {e.hints.map((h) => (
                <li key={h} className="flex gap-2 text-sm">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {h}
                </li>
              ))}
            </ul>
          )}
          {e.costs.lines.length > 0 && (
            <ul className="divide-y divide-border text-sm">
              {e.costs.lines.map((l) => (
                <li key={l.category} className="flex justify-between py-1.5">
                  <span>{EXPENSE_LABELS[l.category]}</span>
                  <span>{euro(l.eur)}</span>
                </li>
              ))}
            </ul>
          )}
          {e.beds.length > 0 && (
            <ul className="divide-y divide-border text-sm" data-testid="economics-beds">
              {e.beds.map((b) => (
                <li key={b.bedId ?? "all"} className="py-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{b.name}</span>
                    <span className={`font-medium ${b.surplus < 0 ? "text-destructive" : ""}`}>{euro(b.surplus)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ernte {euro(b.value)} · Kosten {euro(b.costs)}
                    {b.hours > 0 && ` · ${num(b.hours)} Std.`}
                    {b.m2 !== null && ` · ${num(b.m2)} m²`}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog("cost")}>
                <Coins className="h-4 w-4" />
                Ausgabe
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog("hours")}>
                <Clock className="h-4 w-4" />
                Stunden
              </Button>
            </div>
          )}
          <Entries farm={farm} season={season} e={e} canWrite={canWrite} />
          <p className="text-xs text-muted-foreground">
            Ernte zum Ladenwert nach euren Preisen unter Ertrag. Kosten sind die Ausgaben mit „Garten“; Saatgut, Erde und Wasser zählen dazu. Richtwerte, keine Buchhaltung.
          </p>
        </>
      )}
      {dialog && <EntryDialog farm={farm} season={season} kind={dialog} onClose={() => setDialog(null)} />}
    </section>
  );
}
