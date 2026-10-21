import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Circle, Loader2, Rocket, X } from "lucide-react";
import {
  getGetFarmSetupQueryKey,
  getListFarmAnimalsQueryKey,
  getListFarmTasksQueryKey,
  getListHerdsQueryKey,
  getListRationsQueryKey,
  useDismissFarmSetup,
  useFarmQuickStart,
  useGetFarmSetup,
  type FarmSetup,
  type FarmSpecies,
  type FarmSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { SPECIES_LABELS } from "@/lib/farm-labels";
import { SETUP_STEPS, defaultGroupName } from "@/lib/farm-setup";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

const QUICK_SPECIES: FarmSpecies[] = ["poultry", "rabbit", "guineaPig", "goat", "sheep", "pig", "horse", "cattle", "cat", "dog"];

function QuickStartDialog({ farm, onClose }: { farm: FarmSummary; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [species, setSpecies] = useState<FarmSpecies>("poultry");
  const [count, setCount] = useState("6");
  const [name, setName] = useState("");
  const start = useFarmQuickStart({
    mutation: {
      onSuccess(r) {
        for (const key of [
          getListHerdsQueryKey(farm.id),
          getListFarmAnimalsQueryKey(farm.id),
          getListFarmTasksQueryKey(farm.id),
          getListRationsQueryKey(farm.id),
          getGetFarmSetupQueryKey(farm.id),
        ]) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
        toast({
          title: `${r.animals} ${SPECIES_LABELS[species]} angelegt`,
          description: r.rationId ? `Mit Startration im Futterplaner und ${r.tasks} Erinnerungen.` : `Mit ${r.tasks} Erinnerung.`,
        });
        onClose();
      },
      onError: (err) => toast({ title: "Nicht angelegt", description: errorText(err, ""), variant: "destructive" }),
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    start.mutate({ farmId: farm.id, data: { species, count: Number(count), name: name.trim() || null } });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !start.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tiere schnell anlegen</DialogTitle>
          <DialogDescription>
            Legt eine Gruppe mit nummerierten Tieren an, dazu eine Startration im Futterplaner und tägliche Erinnerungen. Namen und Ohrmarken lassen sich danach ändern.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quick-species">Tierart</Label>
              <select id="quick-species" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={species} onChange={(e) => setSpecies(e.target.value as FarmSpecies)}>
                {QUICK_SPECIES.map((s) => (
                  <option key={s} value={s}>
                    {SPECIES_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quick-count">Anzahl</Label>
              <Input id="quick-count" type="number" min={1} max={50} required value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quick-name">Name der Gruppe</Label>
            <Input id="quick-name" maxLength={60} value={name} placeholder={defaultGroupName(species)} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" disabled={start.isPending} className="gap-1.5">
            {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Anlegen
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Admins of a new farm: what is still to set up – one slim line that opens to the steps. */
export function FarmSetupCard({ farm, onRename }: { farm: FarmSummary; onRename: () => void }) {
  const queryClient = useQueryClient();
  const setup = useGetFarmSetup(farm.id);
  const [quick, setQuick] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dismiss = useDismissFarmSetup({
    mutation: { onSuccess: (data: FarmSetup) => queryClient.setQueryData(getGetFarmSetupQueryKey(farm.id), data) },
  });
  const data = setup.data;
  if (farm.role !== "admin" || !data || data.dismissed) return null;
  const done = new Map(data.steps.map((s) => [s.key, s.done]));
  const open = data.steps.filter((s) => !s.done).length;
  if (open === 0) return null;

  return (
    <section className="rounded-2xl border border-primary/40 bg-primary/5" data-testid="farm-setup">
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Hof einrichten</span>
            <span className="mt-1 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full bg-primary" style={{ width: `${((data.steps.length - open) / data.steps.length) * 100}%` }} />
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {data.steps.length - open} von {data.steps.length}
              </span>
            </span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        <button type="button" aria-label="Einrichtung ausblenden" className="rounded-md p-1 text-muted-foreground hover:bg-muted" onClick={() => dismiss.mutate({ farmId: farm.id, data: { dismissed: true } })}>
          <X className="h-4 w-4" />
        </button>
      </div>
      {expanded && (
        <div className="space-y-3 border-t border-primary/20 px-4 py-3">
          <ul className="space-y-2 text-sm">
            {SETUP_STEPS.map((step) => {
              const ok = done.get(step.key) ?? false;
              const action =
                step.key === "name" ? (
                  <button type="button" className="underline" onClick={onRename}>
                    {step.action}
                  </button>
                ) : step.key === "animals" ? (
                  <button type="button" className="underline" onClick={() => setQuick(true)}>
                    {step.action}
                  </button>
                ) : step.href.startsWith("#") ? (
                  <a href={step.href} className="underline">
                    {step.action}
                  </a>
                ) : (
                  <Link href={step.href} className="underline">
                    {step.action}
                  </Link>
                );
              return (
                <li key={step.key} className="flex items-start gap-2">
                  {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className={ok ? "text-muted-foreground line-through" : ""}>
                    {step.label}
                    {!ok && <span className="block text-xs text-muted-foreground">{step.hint} {action}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          <Button size="sm" className="gap-1.5" onClick={() => setQuick(true)}>
            <Rocket className="h-4 w-4" />
            Tiere schnell anlegen
          </Button>
        </div>
      )}
      {quick && <QuickStartDialog farm={farm} onClose={() => setQuick(false)} />}
    </section>
  );
}
