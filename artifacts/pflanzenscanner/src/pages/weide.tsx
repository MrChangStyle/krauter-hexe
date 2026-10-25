import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ArrowRightLeft, Info, Loader2, LogIn, LogOut, Pencil, Plus, Trash2, Trees } from "lucide-react";
import {
  getGetPasturesQueryKey,
  useCreatePasture,
  useDeleteGrazing,
  useDeletePasture,
  useEndGrazing,
  useEnsureOwnFarm,
  useGetPastures,
  useStartGrazing,
  useUpdatePasture,
  type FarmSummary,
  type Pasture,
  type PastureKind,
  type PastureOverview,
} from "@workspace/api-client-react";
import { DictateButton } from "@/components/dictate-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { todayIso } from "@/lib/farm-labels";
import { deDay } from "@/lib/medicine-labels";
import { num } from "@/lib/yield-labels";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

export const PASTURE_KINDS: Record<PastureKind, string> = {
  pasture: "Weide",
  mowing: "Mähweide",
  paddock: "Auslauf",
  meadow: "Wiese",
};

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

const daysSince = (from: string) => Math.round((Date.parse(todayIso()) - Date.parse(from)) / 86_400_000);

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** Every change answers with all pastures; a refusal shows as a message. */
function useSaved(farm: FarmSummary, after: () => void, setError: (e: string) => void) {
  const queryClient = useQueryClient();
  return {
    onSuccess(next: PastureOverview) {
      queryClient.setQueryData(getGetPasturesQueryKey(farm.id), next);
      after();
    },
    onError: (err: unknown) => setError(errorText(err, "Das hat nicht geklappt.")),
  };
}

function PastureDialog({ farm, pasture, onClose }: { farm: FarmSummary; pasture: Pasture | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: pasture?.name ?? "",
    kind: pasture?.kind ?? ("pasture" as PastureKind),
    areaHa: pasture?.areaHa != null ? String(pasture.areaHa).replace(".", ",") : "",
    restDays: String(pasture?.restDays ?? 35),
    maxGrazeDays: String(pasture?.maxGrazeDays ?? 10),
    notes: pasture?.notes ?? "",
    archived: pasture?.archived ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const saved = useSaved(farm, onClose, setError);
  const create = useCreatePasture({ mutation: saved });
  const update = useUpdatePasture({ mutation: saved });
  const remove = useDeletePasture({ mutation: saved });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const data = {
      name: form.name,
      kind: form.kind,
      areaHa: form.areaHa ? Number(form.areaHa.replace(",", ".")) : null,
      restDays: Number(form.restDays),
      maxGrazeDays: Number(form.maxGrazeDays),
      notes: form.notes || null,
      archived: form.archived,
    };
    if (pasture) update.mutate({ farmId: farm.id, pastureId: pasture.id, data });
    else create.mutate({ farmId: farm.id, data });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{pasture ? "Weide bearbeiten" : "Weide anlegen"}</DialogTitle>
          </DialogHeader>
          <Field id="pw-name" label="Name *">
            <Input id="pw-name" required maxLength={60} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="z. B. Obstwiese, Koppel 2" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="pw-kind" label="Nutzung">
              <select id="pw-kind" className={selectClass} value={form.kind} onChange={(e) => set("kind", e.target.value as PastureKind)}>
                {(Object.keys(PASTURE_KINDS) as PastureKind[]).map((k) => (
                  <option key={k} value={k}>
                    {PASTURE_KINDS[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="pw-area" label="Fläche (ha)">
              <Input id="pw-area" inputMode="decimal" value={form.areaHa} onChange={(e) => set("areaHa", e.target.value)} placeholder="0,5" />
            </Field>
            <Field id="pw-rest" label="Ruhezeit (Tage)">
              <Input id="pw-rest" type="number" min={1} max={365} required value={form.restDays} onChange={(e) => set("restDays", e.target.value)} />
            </Field>
            <Field id="pw-max" label="Höchstens beweiden (Tage)">
              <Input id="pw-max" type="number" min={1} max={365} required value={form.maxGrazeDays} onChange={(e) => set("maxGrazeDays", e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">Üblich sind 4–6 Wochen Ruhe, damit das Gras nachwächst und Wurmlarven absterben, und kurze Weidezeiten von 1–2 Wochen.</p>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="pw-notes">Notiz</Label>
              <DictateButton value={form.notes} onChange={(t) => set("notes", t)} max={500} />
            </div>
            <Input id="pw-notes" maxLength={500} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          {pasture && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.archived} onChange={(e) => set("archived", e.target.checked)} className="h-4 w-4" />
              Wird nicht mehr genutzt
            </label>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            {pasture && farm.role === "admin" && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto gap-1.5 text-destructive hover:text-destructive"
                onClick={() => window.confirm("Diese Weide mit ihrem Weidetagebuch löschen?") && remove.mutate({ farmId: farm.id, pastureId: pasture.id })}
              >
                <Trash2 className="h-4 w-4" />
                Löschen
              </Button>
            )}
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {pasture ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Move = { kind: "on"; pasture: Pasture } | { kind: "move"; pasture: Pasture } | { kind: "off"; pasture: Pasture };

function MoveDialog({ farm, data, move, onClose }: { farm: FarmSummary; data: PastureOverview; move: Move; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const saved = useSaved(farm, onClose, setError);
  const start = useStartGrazing({ mutation: saved });
  const end = useEndGrazing({ mutation: saved });
  const [date, setDate] = useState(todayIso());
  const [herdId, setHerdId] = useState(data.herds[0] ? String(data.herds[0].id) : "");
  const [label, setLabel] = useState("");
  const [animals, setAnimals] = useState(data.herds[0] ? String(data.herds[0].animals || "") : "");
  const targets = data.pastures.filter((p) => !p.archived && p.id !== move.pasture.id);
  const [target, setTarget] = useState(targets.find((p) => p.status === "ready")?.id ?? targets[0]?.id ?? 0);
  const current = move.pasture.current;

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (move.kind === "off") return end.mutate({ farmId: farm.id, grazingId: current!.id, data: { endOn: date } });
    if (move.kind === "move") {
      return start.mutate({ farmId: farm.id, pastureId: target, data: { herdId: current!.herdId, label: current!.label, animals: current!.animals, startOn: date, fromGrazingId: current!.id } });
    }
    start.mutate({ farmId: farm.id, pastureId: move.pasture.id, data: { herdId: herdId ? Number(herdId) : null, label: herdId ? null : label, animals: Number(animals), startOn: date } });
  }

  const title = move.kind === "on" ? `Auftreiben: ${move.pasture.name}` : move.kind === "move" ? `Umtreiben: ${current!.label}` : `Abtreiben: ${move.pasture.name}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {move.kind === "on" && (
            <>
              <Field id="mv-herd" label="Gruppe">
                <select
                  id="mv-herd"
                  className={selectClass}
                  value={herdId}
                  onChange={(e) => {
                    setHerdId(e.target.value);
                    const herd = data.herds.find((h) => String(h.id) === e.target.value);
                    if (herd) setAnimals(String(herd.animals || ""));
                  }}
                >
                  {data.herds.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.animals} Tiere)
                    </option>
                  ))}
                  <option value="">Andere Tiere …</option>
                </select>
              </Field>
              {!herdId && (
                <Field id="mv-label" label="Welche Tiere">
                  <Input id="mv-label" required maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. Pferde vom Nachbarn" />
                </Field>
              )}
              <Field id="mv-animals" label="Anzahl Tiere">
                <Input id="mv-animals" type="number" min={1} required value={animals} onChange={(e) => setAnimals(e.target.value)} />
              </Field>
            </>
          )}
          {move.kind === "move" && (
            <Field id="mv-target" label="Auf welche Weide">
              <select id="mv-target" className={selectClass} value={target} onChange={(e) => setTarget(Number(e.target.value))}>
                {targets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} – {p.status === "ready" ? "bereit" : p.status === "resting" ? `ruht bis ${deDay(p.readyOn!)}` : "beweidet"}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field id="mv-date" label={move.kind === "off" ? "Letzter Tag auf der Weide" : "Ab"}>
            <Input id="mv-date" type="date" required max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={start.isPending || end.isPending || (move.kind === "move" && !target)}>
            {move.kind === "on" ? "Auftreiben" : move.kind === "move" ? "Umtreiben" : "Abtreiben"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusLine({ p }: { p: Pasture }) {
  if (p.current) {
    const days = daysSince(p.current.startOn);
    return (
      <p className="text-sm">
        <span className="font-medium text-lime-700 dark:text-lime-300">Beweidet</span> von {p.current.label} ({p.current.animals}){" "}
        {days <= 0 ? "seit heute" : `seit ${deDay(p.current.startOn)}, ${days} ${days === 1 ? "Tag" : "Tage"}`}
      </p>
    );
  }
  if (p.status === "resting") return <p className="text-sm text-amber-700 dark:text-amber-300">Ruht bis {deDay(p.readyOn!)}</p>;
  return <p className="text-sm text-primary">Bereit</p>;
}

function PastureCard({ farm, p, onMove, onEdit }: { farm: FarmSummary; p: Pasture; onMove: (m: Move) => void; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const remove = useDeleteGrazing({ mutation: { onSuccess: (next) => queryClient.setQueryData(getGetPasturesQueryKey(farm.id), next) } });
  const canWrite = farm.role !== "guest";
  return (
    <li className="rounded-xl border border-border bg-card p-3" data-testid="pasture">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{p.name}</p>
          <p className="text-xs text-muted-foreground">
            {PASTURE_KINDS[p.kind]}
            {p.areaHa != null ? ` · ${num(p.areaHa)} ha` : ""} · Ruhe {p.restDays} Tage
          </p>
        </div>
        {canWrite && (
          <button type="button" aria-label="Weide bearbeiten" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>
      {p.archived ? <p className="text-sm text-muted-foreground">Wird nicht mehr genutzt</p> : <StatusLine p={p} />}
      {(p.grazingDays > 0 || p.animalDays > 0) && (
        <p className="text-xs text-muted-foreground">
          Dieses Jahr {p.grazingDays} {p.grazingDays === 1 ? "Weidetag" : "Weidetage"}
          {p.animalDaysPerHa !== null ? ` · ${p.animalDaysPerHa.toLocaleString("de-DE")} Tier-Tage je ha` : ` · ${p.animalDays} Tier-Tage`}
        </p>
      )}
      {canWrite && !p.archived && (
        <div className="mt-2 flex flex-wrap gap-2">
          {p.current ? (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onMove({ kind: "move", pasture: p })}>
                <ArrowRightLeft className="h-4 w-4" />
                Umtreiben
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onMove({ kind: "off", pasture: p })}>
                <LogOut className="h-4 w-4" />
                Abtreiben
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onMove({ kind: "on", pasture: p })}>
              <LogIn className="h-4 w-4" />
              Auftreiben
            </Button>
          )}
        </div>
      )}
      {p.grazings.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">Weidetagebuch ({p.grazings.length})</summary>
          <ul className="divide-y divide-border pt-1">
            {p.grazings.map((g) => (
              <li key={g.id} className="flex items-center gap-2 py-1.5 text-xs">
                <span className="flex-1">
                  {deDay(g.startOn)}–{g.endOn ? deDay(g.endOn) : "heute"} · {g.label} ({g.animals})
                </span>
                {canWrite && (
                  <button
                    type="button"
                    aria-label="Eintrag löschen"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => window.confirm("Diesen Eintrag löschen?") && remove.mutate({ farmId: farm.id, grazingId: g.id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function Pastures({ farm }: { farm: FarmSummary }) {
  const pastures = useGetPastures(farm.id);
  const [move, setMove] = useState<Move | null>(null);
  const [edit, setEdit] = useState<{ pasture: Pasture | null } | null>(null);
  const d = pastures.data;
  if (pastures.isLoading) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  if (!d) return <p className="text-sm text-muted-foreground">Die Weiden lassen sich gerade nicht laden.</p>;
  const used = d.pastures.filter((p) => !p.archived);
  const old = d.pastures.filter((p) => p.archived);
  const hints = used.flatMap((p) => p.hints).sort((a, b) => Number(b.urgent) - Number(a.urgent));
  const count = (s: Pasture["status"]) => used.filter((p) => p.status === s).length;

  return (
    <div className="space-y-5">
      {used.length > 0 && (
        <section className="grid grid-cols-3 gap-2 text-sm">
          {(
            [
              ["grazed", "Beweidet"],
              ["resting", "Ruhen"],
              ["ready", "Bereit"],
            ] as const
          ).map(([s, label]) => (
            <div key={s} className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold" data-testid={`pastures-${s}`}>
                {count(s)}
              </p>
            </div>
          ))}
        </section>
      )}
      {hints.length > 0 && (
        <ul className="space-y-2">
          {hints.map((h) => (
            <li
              key={`${h.pastureId}-${h.kind}`}
              className={`flex gap-2.5 rounded-xl border p-3 text-sm ${h.urgent ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40" : "border-border bg-card"}`}
            >
              {h.urgent ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
              {h.text}
            </li>
          ))}
        </ul>
      )}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Weiden</h2>
          {farm.role !== "guest" && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEdit({ pasture: null })}>
              <Plus className="h-4 w-4" />
              Weide
            </Button>
          )}
        </div>
        {used.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Weiden. Lege jede Fläche einmal an – dann trägst du mit einem Tipp ein, wann welche Herde auf- und umgetrieben wird.</p>
        ) : (
          <ul className="space-y-2">
            {used.map((p) => (
              <PastureCard key={p.id} farm={farm} p={p} onMove={setMove} onEdit={() => setEdit({ pasture: p })} />
            ))}
          </ul>
        )}
        {old.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Nicht mehr genutzt ({old.length})</summary>
            <ul className="space-y-2 pt-2">
              {old.map((p) => (
                <PastureCard key={p.id} farm={farm} p={p} onMove={setMove} onEdit={() => setEdit({ pasture: p })} />
              ))}
            </ul>
          </details>
        )}
      </section>
      {move && <MoveDialog farm={farm} data={d} move={move} onClose={() => setMove(null)} />}
      {edit && <PastureDialog farm={farm} pasture={edit.pasture} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** /farm/weide – pastures and the grazing diary (docs/weide.md). */
export default function WeidePage() {
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
          <Trees className="h-6 w-6 text-lime-600 dark:text-lime-400" />
          Weide
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Welche Herde wann wo steht – und wann eine Fläche wieder bereit ist.</p>
      </div>
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Pastures farm={farm} />}
    </div>
  );
}
