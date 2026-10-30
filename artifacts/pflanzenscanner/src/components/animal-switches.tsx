import { useQueryClient } from "@tanstack/react-query";
import { getGetSettingsQueryKey, useSetSettings, type AnimalKind } from "@workspace/api-client-react";
import { PawPrint } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useHealTargets } from "@/hooks/use-animal-kinds";
import { toggleAnimal } from "@/lib/animal-kinds";
import { HEAL_TARGETS } from "@/lib/heal-targets";
import { cn } from "@/lib/utils";

/**
 * Meine Tierarten (docs/module.md): which animal kinds "Essbar für" and the
 * Kräuter-Hexe offer. A tap shows or hides a kind and saves right away.
 */
export function AnimalSwitches() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hidden } = useHealTargets();
  const save = useSetSettings({
    mutation: {
      onSuccess: (data) => queryClient.setQueryData(getGetSettingsQueryKey(), data),
      onError: () => toast({ title: "Nicht gespeichert", description: "Bitte versuche es noch einmal.", variant: "destructive" }),
    },
  });
  const set = (next: string[]) => save.mutate({ data: { hiddenAnimals: next as AnimalKind[] } });
  const animals = HEAL_TARGETS.filter((t) => t.key !== "human");

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4" data-testid="animal-kinds">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <PawPrint className="h-4 w-4 text-primary" />
          Meine Tierarten
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Welche Tiere „Essbar für …“ im Lexikon und die Kräuter-Hexe zeigen. Tippe an, was du nicht hältst – der Mensch bleibt immer.
        </p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {animals.map((t) => {
          const on = !(hidden as string[]).includes(t.key);
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              disabled={save.isPending}
              onClick={() => set(toggleAnimal(hidden, t.key))}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-xs font-medium transition-all active:scale-95",
                on ? "border-primary bg-primary/10 text-foreground" : "bg-muted/40 text-muted-foreground opacity-60 grayscale",
              )}
            >
              <span className="text-2xl leading-none" aria-hidden="true">{t.emoji}</span>
              {t.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {hidden.length === 0 ? "Alle Tierarten werden gezeigt." : `${animals.length - hidden.length} von ${animals.length} Tierarten gewählt.`}
        {hidden.length > 0 && (
          <button type="button" className="ml-2 font-medium text-primary underline-offset-2 hover:underline" disabled={save.isPending} onClick={() => set([])}>
            Alle zeigen
          </button>
        )}
      </p>
    </section>
  );
}
