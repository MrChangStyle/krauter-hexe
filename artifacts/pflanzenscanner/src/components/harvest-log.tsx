import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Scale, Trash2 } from "lucide-react";
import {
  getGetGardenPlanQueryKey,
  getListHarvestsQueryKey,
  useAddHarvest,
  useListHarvests,
  useRemoveHarvest,
  type BedPlanting,
  type HarvestUse,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CELL_CM } from "@/lib/garden-planner";
import { shortDay, todayKey } from "@/lib/garden-calendar";
import { cn } from "@/lib/utils";

const USE_LABELS: Record<HarvestUse, string> = { kitchen: "Küche", fodder: "Tierfutter" };
const kg = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })} kg`;

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

/** Ernten of one planting: log what it brought; the Garten-Assistent learns from it. */
export function HarvestLog({ farmId, planting, canWrite }: { farmId: number; planting: BedPlanting; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const harvests = useListHarvests(farmId, planting.season);
  const mine = (harvests.data ?? []).filter((h) => h.plantingId === planting.id);
  const total = mine.reduce((s, h) => s + h.amountKg, 0);
  const m2 = (planting.w * planting.h * CELL_CM * CELL_CM) / 10_000;
  const [amount, setAmount] = useState("");
  const [use, setUse] = useState<HarvestUse>("kitchen");
  const [day, setDay] = useState(todayKey());
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListHarvestsQueryKey(farmId, planting.season) }),
      queryClient.invalidateQueries({ queryKey: getGetGardenPlanQueryKey(farmId) }),
    ]);
  const add = useAddHarvest({
    mutation: {
      onSuccess() {
        setAmount("");
        void refresh();
      },
      onError: (err) => toast({ title: "Nicht gespeichert", description: errorText(err, "Bitte prüfe Menge und Datum."), variant: "destructive" }),
    },
  });
  const remove = useRemoveHarvest({ mutation: { onSuccess: () => void refresh() } });

  function submit(event: FormEvent) {
    event.preventDefault();
    const amountKg = Number(amount.replace(",", "."));
    if (!Number.isFinite(amountKg) || amountKg <= 0) {
      toast({ title: "Bitte gib die Menge in kg an", variant: "destructive" });
      return;
    }
    add.mutate({ farmId, plantingId: planting.id, data: { harvestedOn: day, amountKg, use } });
  }

  return (
    <section className="space-y-2 border-t border-border pt-3 text-sm">
      <p className="flex items-center gap-1.5 font-semibold">
        <Scale className="h-4 w-4 text-primary" />
        Ernte {planting.season}
        {total > 0 && (
          <span className="font-normal text-muted-foreground">
            · {kg(total)} · {(total / m2).toLocaleString("de-DE", { maximumFractionDigits: 1 })} kg/m²
          </span>
        )}
      </p>
      {mine.length > 0 && (
        <ul className="space-y-1">
          {mine.map((h) => (
            <li key={h.id} className="flex items-center gap-2">
              <span className="w-12 tabular-nums text-muted-foreground">{shortDay(h.harvestedOn)}</span>
              <span className="flex-1">
                {kg(h.amountKg)} · {USE_LABELS[h.use]}
                {h.organic && <span className="ml-1 rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">Bio</span>}
              </span>
              {canWrite && (
                <button
                  type="button"
                  aria-label={`Ernte vom ${shortDay(h.harvestedOn)} löschen`}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ farmId, harvestId: h.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <form onSubmit={submit} className="space-y-2">
          <div className="flex gap-2">
            <Input
              aria-label="Menge in kg"
              inputMode="decimal"
              placeholder="kg"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-20"
            />
            <Input aria-label="Erntedatum" type="date" value={day} max={todayKey()} onChange={(e) => setDay(e.target.value)} className="flex-1" />
          </div>
          <div className="flex items-center gap-2">
            {(["kitchen", "fodder"] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={use === u}
                onClick={() => setUse(u)}
                className={cn("rounded-full border px-3 py-1 text-xs", use === u ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}
              >
                {USE_LABELS[u]}
              </button>
            ))}
            <Button type="submit" size="sm" className="ml-auto gap-1" disabled={add.isPending}>
              {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Ernte eintragen
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Aus euren Ernten lernt der Garten-Assistent, wie viel eure Beete wirklich bringen.</p>
        </form>
      ) : (
        mine.length === 0 && <p className="text-muted-foreground">Noch keine Ernte eingetragen.</p>
      )}
    </section>
  );
}
