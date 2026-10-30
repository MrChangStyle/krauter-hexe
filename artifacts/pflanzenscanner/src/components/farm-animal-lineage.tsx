import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { GitFork, Loader2, Pencil } from "lucide-react";
import { getGetLineageQueryKey, useGetLineage, useListFarmAnimals, useSetLineage, type FarmAnimal } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { parentChoices } from "@/lib/breeding-labels";
import { deDay } from "@/lib/medicine-labels";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

/** Abstammung: mother, father and young of an animal; parents can be set by hand. */
export function LineageSection({ farmId, animal, canWrite }: { farmId: number; animal: FarmAnimal; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const lineage = useGetLineage(farmId, animal.id);
  const animals = useListFarmAnimals(farmId).data ?? [];
  const [editing, setEditing] = useState(false);
  const [mother, setMother] = useState("");
  const [father, setFather] = useState("");
  const save = useSetLineage({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getGetLineageQueryKey(farmId, animal.id), data);
        setEditing(false);
      },
      onError: (err) => toast({ title: "Nicht gespeichert", description: (err as { data?: { error?: string } }).data?.error, variant: "destructive" }),
    },
  });
  const l = lineage.data;
  if (!l) return null;
  const others = animals.filter((a) => a.id !== animal.id);
  const link = (a: { id: number; name: string } | null) => (a ? <Link href={`/farm/${farmId}/tier/${a.id}`} className="underline">{a.name}</Link> : <span className="text-muted-foreground">unbekannt</span>);
  const options = (list: FarmAnimal[]) =>
    list.map((a) => (
      <option key={a.id} value={a.id}>
        {a.name}
        {a.registrationNumber && ` (${a.registrationNumber})`}
      </option>
    ));

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <GitFork className="h-4 w-4 text-primary" />
          Abstammung
        </h2>
        {canWrite && !editing && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setMother(l.mother ? String(l.mother.id) : "");
              setFather(l.father ? String(l.father.id) : "");
              setEditing(true);
            }}
          >
            <Pencil className="h-4 w-4" />
            Eltern
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lin-mother">Mutter</Label>
            <select id="lin-mother" className={selectClass} value={mother} onChange={(e) => setMother(e.target.value)}>
              <option value="">Unbekannt</option>
              {options(parentChoices(others, animal.species, "mother"))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lin-father">Vater</Label>
            <select id="lin-father" className={selectClass} value={father} onChange={(e) => setFather(e.target.value)}>
              <option value="">Unbekannt</option>
              {options(parentChoices(others, animal.species, "father"))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={save.isPending}
              onClick={() => save.mutate({ farmId, animalId: animal.id, data: { motherId: mother ? Number(mother) : null, fatherId: father ? Number(father) : null } })}
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Speichern
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1 rounded-2xl border bg-card p-4 text-sm">
          <p>Mutter: {link(l.mother)}</p>
          <p>Vater: {link(l.father)}</p>
          {l.offspring.length > 0 && (
            <div className="pt-1">
              <p className="font-medium">Nachkommen ({l.offspring.length})</p>
              <ul className="space-y-0.5">
                {l.offspring.map((o) => (
                  <li key={o.id}>
                    {link(o)}
                    {o.birthDate && <span className="text-muted-foreground"> · {deDay(o.birthDate)}</span>}
                    {o.archived && <span className="text-muted-foreground"> · archiviert</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
