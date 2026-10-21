import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, Loader2, PawPrint, Plus, Tractor } from "lucide-react";
import {
  getListHerdsQueryKey,
  useCreateHerd,
  useListFarmAnimals,
  useListHerds,
  type FarmAnimal,
  type FarmSpecies,
  type FarmSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SPECIES_LABELS, SPECIES_ORDER, SEX_LABELS, ageText } from "@/lib/farm-labels";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

/** Shown animals: herd filter and the archived switch applied, by name. */
export function visibleAnimals(
  animals: FarmAnimal[],
  herdId: number | "all" | "none",
  showArchived: boolean,
): FarmAnimal[] {
  return animals.filter((a) => {
    if (!showArchived && a.archivedAt) return false;
    if (herdId === "all") return true;
    if (herdId === "none") return a.herdId === null;
    return a.herdId === herdId;
  });
}

/** One animal as a small tile – four in a row: photo, name, kind. */
function AnimalTile({ animal, farmId }: { animal: FarmAnimal; farmId: number }) {
  const age = ageText(animal.birthDate);
  return (
    <Link
      href={`/farm/${farmId}/tier/${animal.id}`}
      title={`${animal.name} · ${SPECIES_LABELS[animal.species]}${animal.breed ? ` · ${animal.breed}` : ""} · ${SEX_LABELS[animal.sex]}${age ? ` · ${age}` : ""} · ${animal.registrationNumber}`}
      className={cn("flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-card p-1.5 transition-colors hover:bg-muted/50", animal.archivedAt && "opacity-60")}
    >
      {animal.imageUrl ? (
        <img src={animal.imageUrl} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
      ) : (
        <span className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted">
          <PawPrint className="h-6 w-6 text-muted-foreground" />
        </span>
      )}
      <span className="truncate px-0.5 text-xs font-medium leading-tight">{animal.name}</span>
      <span className="-mt-1 truncate px-0.5 text-[10px] text-muted-foreground">
        {animal.archivedAt ? "archiviert" : animal.breed || SPECIES_LABELS[animal.species]}
      </span>
    </Link>
  );
}

function NewHerdDialog({
  farmId,
  open,
  onOpenChange,
}: {
  farmId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<FarmSpecies>("poultry");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateHerd({
    mutation: {
      onSuccess() {
        void queryClient.invalidateQueries({ queryKey: getListHerdsQueryKey(farmId) });
        setName("");
        setError(null);
        onOpenChange(false);
      },
      onError: (err) =>
        setError((err as { data?: { error?: string } } | null)?.data?.error ?? "Das hat nicht geklappt."),
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate({ farmId, data: { name, species } });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Neue Herde</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="herd-name">Name</Label>
            <Input id="herd-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="z. B. Legehennen" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="herd-species">Tierart</Label>
            <select id="herd-species" className={selectClass} value={species} onChange={(e) => setSpecies(e.target.value as FarmSpecies)}>
              {SPECIES_ORDER.map((s) => (
                <option key={s} value={s}>
                  {SPECIES_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim()} className="gap-2">
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Anlegen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Animals and herds of the active farm on the "Meine Farm" page. */
export function FarmAnimalsSection({ farm }: { farm: FarmSummary }) {
  const animals = useListFarmAnimals(farm.id);
  const herds = useListHerds(farm.id);
  const [herdFilter, setHerdFilter] = useState<number | "all" | "none">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [herdDialog, setHerdDialog] = useState(false);
  const canWrite = farm.role !== "guest";

  const all = animals.data ?? [];
  const shown = visibleAnimals(all, herdFilter, showArchived);
  const archivedCount = all.filter((a) => a.archivedAt).length;
  const hasUnherded = all.some((a) => a.herdId === null && !a.archivedAt);

  const chip = (active: boolean) =>
    cn(
      "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
    );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <PawPrint className="h-4 w-4 text-primary" />
          Tiere
          {all.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({all.length - archivedCount})</span>
          )}
        </h2>
        {canWrite && (
          <Button asChild size="sm" className="gap-1.5">
            <Link href={`/farm/${farm.id}/tier/neu`}>
              <Plus className="h-4 w-4" />
              Tier anlegen
            </Link>
          </Button>
        )}
      </div>

      {(herds.data?.length ?? 0) > 0 || canWrite ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <button type="button" className={chip(herdFilter === "all")} onClick={() => setHerdFilter("all")}>
            Alle
          </button>
          {(herds.data ?? []).map((h) => (
            <button key={h.id} type="button" className={chip(herdFilter === h.id)} onClick={() => setHerdFilter(h.id)}>
              {h.name} ({h.animalCount})
            </button>
          ))}
          {hasUnherded && (herds.data?.length ?? 0) > 0 && (
            <button type="button" className={chip(herdFilter === "none")} onClick={() => setHerdFilter("none")}>
              Ohne Herde
            </button>
          )}
          {canWrite && (
            <button type="button" className={cn(chip(false), "border-dashed")} onClick={() => setHerdDialog(true)}>
              + Herde
            </button>
          )}
        </div>
      ) : null}

      {animals.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : all.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <Tractor className="mx-auto mb-2 h-8 w-8 text-primary/70" />
          <p className="font-medium">Noch keine Tiere</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canWrite
              ? "Leg dein erstes Tier an – mit Foto, Ring- oder Ohrmarkennummer und Geburtsdatum."
              : "Auf dieser Farm sind noch keine Tiere eingetragen."}
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine Tiere in dieser Auswahl.</p>
      ) : (
        <div className="grid grid-cols-4 gap-2" data-testid="farm-animal-tiles">
          {shown.map((a) => (
            <AnimalTile key={a.id} animal={a} farmId={farm.id} />
          ))}
        </div>
      )}

      {archivedCount > 0 && (
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4"
          onClick={() => setShowArchived(!showArchived)}
        >
          <Archive className="h-3.5 w-3.5" />
          {showArchived ? "Archivierte ausblenden" : `Archivierte anzeigen (${archivedCount})`}
        </button>
      )}

      <NewHerdDialog farmId={farm.id} open={herdDialog} onOpenChange={setHerdDialog} />
    </section>
  );
}
