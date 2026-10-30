import { useEffect, useState, type FormEvent } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Minus, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import {
  getGetPantryQueryKey,
  useCreatePantryItem,
  useDeletePantryItem,
  useEnsureOwnFarm,
  useGetPantry,
  useTakeFromPantry,
  useUndoPantryUse,
  useUpdatePantryItem,
  type FarmSummary,
  type PantryItem,
  type PantryKind,
  type PantryOverview,
} from "@workspace/api-client-react";
import { DictateButton } from "@/components/dictate-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { todayIso } from "@/lib/farm-labels";
import { deDay } from "@/lib/medicine-labels";
import { PANTRY_KINDS, PANTRY_UNITS, kindForCrop, suggestBestBefore } from "@/lib/pantry-labels";
import { num } from "@/lib/yield-labels";
import { PageHeader } from "@/components/page-header";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

const STATUS_STYLE: Record<PantryItem["status"], string> = {
  expired: "text-red-700 dark:text-red-300",
  soon: "text-amber-700 dark:text-amber-300",
  ok: "text-muted-foreground",
  empty: "text-muted-foreground",
};

function bestBeforeText(i: PantryItem): string {
  if (!i.bestBefore) return "ohne MHD";
  if (i.status === "expired") return `MHD abgelaufen am ${deDay(i.bestBefore)}`;
  if (i.status === "soon") return `bald aufbrauchen, bis ${deDay(i.bestBefore)}`;
  return `haltbar bis ${deDay(i.bestBefore)}`;
}

interface FormState {
  name: string;
  kind: PantryKind;
  amount: string;
  unit: string;
  location: string;
  madeOn: string;
  bestBefore: string;
  harvestId: number | null;
  notes: string;
  /** The user typed a date: no more suggestions. */
  ownBestBefore: boolean;
}

function emptyForm(): FormState {
  const madeOn = todayIso();
  return { name: "", kind: "canned", amount: "", unit: "Glas", location: "", madeOn, bestBefore: suggestBestBefore("canned", madeOn), harvestId: null, notes: "", ownBestBefore: false };
}

function formOf(i: PantryItem): FormState {
  return {
    name: i.name,
    kind: i.kind,
    amount: String(i.amount).replace(".", ","),
    unit: i.unit,
    location: i.location ?? "",
    madeOn: i.madeOn,
    bestBefore: i.bestBefore ?? "",
    harvestId: i.harvestId,
    notes: i.notes ?? "",
    ownBestBefore: true,
  };
}

function ItemDialog({ farm, data, item, open, onOpenChange }: { farm: FarmSummary; data: PantryOverview; item: PantryItem | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => (item ? formOf(item) : emptyForm()));
  const [error, setError] = useState<string | null>(null);
  const done = {
    onSuccess(next: PantryOverview) {
      queryClient.setQueryData(getGetPantryQueryKey(farm.id), next);
      onOpenChange(false);
    },
    onError: (err: unknown) => setError(errorText(err, "Das hat nicht geklappt.")),
  };
  const create = useCreatePantryItem({ mutation: done });
  const update = useUpdatePantryItem({ mutation: done });
  const remove = useDeletePantryItem({ mutation: done });
  const busy = create.isPending || update.isPending || remove.isPending;

  /** Kind or day changed: a new suggestion, unless the user typed a date. */
  function change(next: Partial<FormState>) {
    setForm((f) => {
      const merged = { ...f, ...next };
      if (!merged.ownBestBefore && ("kind" in next || "madeOn" in next)) merged.bestBefore = suggestBestBefore(merged.kind, merged.madeOn);
      return merged;
    });
  }

  function fromHarvest(id: string) {
    const h = data.harvests.find((x) => String(x.id) === id);
    if (!h) return change({ harvestId: null });
    const kind = kindForCrop(h.cropKey);
    change({ harvestId: h.id, kind, name: form.name || h.label, unit: PANTRY_KINDS[kind].unit });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const body = {
      name: form.name,
      kind: form.kind,
      amount: Number(form.amount.replace(",", ".")),
      unit: form.unit,
      location: form.location || null,
      madeOn: form.madeOn,
      bestBefore: form.bestBefore || null,
      harvestId: form.harvestId,
      notes: form.notes || null,
    };
    if (item) update.mutate({ farmId: farm.id, itemId: item.id, data: body });
    else create.mutate({ farmId: farm.id, data: body });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{item ? "Vorrat bearbeiten" : "Einlagern"}</DialogTitle>
          </DialogHeader>
          {!item && data.harvests.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pa-harvest">Aus einer Ernte</Label>
              <select id="pa-harvest" className={selectClass} value={form.harvestId ?? ""} onChange={(e) => fromHarvest(e.target.value)}>
                <option value="">– nicht aus der Ernte –</option>
                {data.harvests.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.label}, {num(h.amountKg)} kg vom {deDay(h.harvestedOn)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pa-name">Was *</Label>
            <Input id="pa-name" required maxLength={80} value={form.name} onChange={(e) => change({ name: e.target.value })} placeholder="z. B. Tomatensoße, Kirschen" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pa-kind">Art</Label>
              <select
                id="pa-kind"
                className={selectClass}
                value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value as PantryKind;
                  change({ kind, unit: item ? form.unit : PANTRY_KINDS[kind].unit });
                }}
              >
                {(Object.keys(PANTRY_KINDS) as PantryKind[]).map((k) => (
                  <option key={k} value={k}>
                    {PANTRY_KINDS[k].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pa-location">Lagerort</Label>
              <Input id="pa-location" list="pa-locations" maxLength={60} value={form.location} onChange={(e) => change({ location: e.target.value })} placeholder="Keller, Truhe …" />
              <datalist id="pa-locations">
                {data.locations.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pa-amount">{item ? "Noch da" : "Menge"} *</Label>
              <Input id="pa-amount" required inputMode="decimal" value={form.amount} onChange={(e) => change({ amount: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pa-unit">Einheit</Label>
              <Input id="pa-unit" required list="pa-units" maxLength={20} value={form.unit} onChange={(e) => change({ unit: e.target.value })} />
              <datalist id="pa-units">
                {PANTRY_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pa-made">Hergestellt am</Label>
              <Input id="pa-made" type="date" required max={todayIso()} value={form.madeOn} onChange={(e) => change({ madeOn: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pa-best">Haltbar bis</Label>
              <Input id="pa-best" type="date" value={form.bestBefore} onChange={(e) => change({ bestBefore: e.target.value, ownBestBefore: true })} />
            </div>
          </div>
          {!form.ownBestBefore && form.bestBefore && <p className="text-xs text-muted-foreground">Vorschlag für „{PANTRY_KINDS[form.kind].label}“ – bei Bedarf ändern.</p>}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="pa-notes">Notiz</Label>
              <DictateButton value={form.notes} onChange={(t) => change({ notes: t })} max={500} />
            </div>
            <Input id="pa-notes" maxLength={500} value={form.notes} onChange={(e) => change({ notes: e.target.value })} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            {item && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto gap-1.5 text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => window.confirm("Diesen Vorrat löschen?") && remove.mutate({ farmId: farm.id, itemId: item.id })}
              >
                <Trash2 className="h-4 w-4" />
                Löschen
              </Button>
            )}
            <Button type="submit" disabled={busy} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {item ? "Speichern" : "Einlagern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ItemCard({ farm, item, canWrite, onEdit }: { farm: FarmSummary; item: PantryItem; canWrite: boolean; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const done = {
    onSuccess: (next: PantryOverview) => queryClient.setQueryData(getGetPantryQueryKey(farm.id), next),
    onError: (err: unknown) => toast({ title: "Nicht gespeichert", description: errorText(err, ""), variant: "destructive" }),
  };
  const take = useTakeFromPantry({ mutation: done });
  const undo = useUndoPantryUse({ mutation: done });
  const last = item.uses[0];
  const step = item.amount >= 1 ? 1 : item.amount;
  return (
    <li className="rounded-xl border border-border bg-card p-3 text-sm" data-testid="pantry-item">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            {PANTRY_KINDS[item.kind].label}
            {item.location ? ` · ${item.location}` : ""}
          </p>
          <p className={`text-xs ${STATUS_STYLE[item.status]}`}>{item.status === "empty" ? "aufgebraucht" : bestBeforeText(item)}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums">
            {num(item.amount)} <span className="text-sm font-normal">{item.unit}</span>
          </p>
          {item.initialAmount > item.amount && <p className="text-xs text-muted-foreground">von {num(item.initialAmount)}</p>}
        </div>
      </div>
      {canWrite && (
        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            disabled={item.amount <= 0 || take.isPending}
            onClick={() => take.mutate({ farmId: farm.id, itemId: item.id, data: { amount: step } })}
          >
            <Minus className="h-4 w-4" />
            {num(step)} {item.unit} genommen
          </Button>
          <button type="button" aria-label="Vorrat bearbeiten" className="ml-auto rounded-md p-2 text-muted-foreground hover:bg-muted" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      )}
      {last && (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          Zuletzt: {num(last.amount)} {item.unit} am {deDay(last.date)}
          {canWrite && (
            <button type="button" className="ml-1 inline-flex items-center gap-0.5 text-primary" onClick={() => undo.mutate({ farmId: farm.id, itemId: item.id, useId: last.id })}>
              <Undo2 className="h-3 w-3" />
              rückgängig
            </button>
          )}
        </p>
      )}
    </li>
  );
}

function Pantry({ farm }: { farm: FarmSummary }) {
  const pantry = useGetPantry(farm.id);
  const [dialog, setDialog] = useState<{ item: PantryItem | null; key: number } | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const canWrite = farm.role !== "guest";
  const d = pantry.data;
  if (pantry.isLoading) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  if (!d) return <p className="text-sm text-muted-foreground">Die Vorratskammer lässt sich gerade nicht laden.</p>;
  const shown = d.items.filter((i) => place === null || i.location === place);
  const stocked = shown.filter((i) => i.status !== "empty");
  const empty = shown.filter((i) => i.status === "empty");

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Vorräte</p>
          <p className="text-lg font-semibold" data-testid="pantry-stocked">{d.stocked}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Bald aufbrauchen</p>
          <p className={`text-lg font-semibold ${d.soon > 0 ? "text-amber-700 dark:text-amber-300" : ""}`}>{d.soon}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Abgelaufen</p>
          <p className={`text-lg font-semibold ${d.expired > 0 ? "text-red-700 dark:text-red-300" : ""}`}>{d.expired}</p>
        </div>
      </section>

      <div className="flex items-center gap-2">
        {d.locations.length > 1 && (
          <div className="flex flex-1 gap-1 overflow-x-auto" role="group" aria-label="Nach Lagerort filtern">
            {[null, ...d.locations].map((l) => (
              <button
                key={l ?? "all"}
                type="button"
                aria-pressed={place === l}
                onClick={() => setPlace(l)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs ${place === l ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
              >
                {l ?? "Alle"}
              </button>
            ))}
          </div>
        )}
        {canWrite && (
          <Button size="sm" className="ml-auto gap-1.5" onClick={() => setDialog({ item: null, key: Date.now() })}>
            <Plus className="h-4 w-4" />
            Einlagern
          </Button>
        )}
      </div>

      {stocked.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch nichts eingelagert. Eingekochtes, Eingefrorenes, Honig oder Eier: einmal eintragen – dann ist es ein Tipp, wenn etwas aus dem Keller geholt wird.
        </p>
      ) : (
        <ul className="space-y-2">
          {stocked.map((i) => (
            <ItemCard key={i.id} farm={farm} item={i} canWrite={canWrite} onEdit={() => setDialog({ item: i, key: Date.now() })} />
          ))}
        </ul>
      )}
      {empty.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Aufgebraucht ({empty.length})</summary>
          <ul className="space-y-2 pt-2">
            {empty.map((i) => (
              <ItemCard key={i.id} farm={farm} item={i} canWrite={canWrite} onEdit={() => setDialog({ item: i, key: Date.now() })} />
            ))}
          </ul>
        </details>
      )}
      {dialog && <ItemDialog key={dialog.key} farm={farm} data={d} item={dialog.item} open onOpenChange={(o) => !o && setDialog(null)} />}
    </div>
  );
}

/** /vorrat – Vorratskammer (docs/vorratskammer.md). */
export default function VorratPage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="vorrat" subtitle="Was eingekocht, eingefroren oder getrocknet ist – und was bald weg muss." />
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Pantry farm={farm} />}
    </div>
  );
}
