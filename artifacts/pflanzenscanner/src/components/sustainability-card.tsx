import { useQueryClient } from "@tanstack/react-query";
import { Copy, Flower2 } from "lucide-react";
import {
  getGetFarmSustainabilityQueryKey,
  useGetFarmFarming,
  useGetFarmSustainability,
  useSetFarmSustainability,
  type FarmSummary,
  type SustainabilityKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { SUSTAINABILITY, farmProfile } from "@/lib/sustainability";

/**
 * Nachhaltigkeit (docs/bio.md, B8) on Farm & Team: tick what the farm does –
 * for every level of farming – and copy it as a Hof-Steckbrief.
 */
export function SustainabilityCard({ farm }: { farm: FarmSummary }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useGetFarmSustainability(farm.id);
  const farming = useGetFarmFarming(farm.id);
  const save = useSetFarmSustainability({
    mutation: {
      onSuccess: (data) => queryClient.setQueryData(getGetFarmSustainabilityQueryKey(farm.id), data),
      onError: () => toast({ title: "Nicht gespeichert", variant: "destructive" }),
    },
  });
  const canWrite = farm.role !== "guest";
  const keys = query.data?.keys ?? [];
  const profile = farming.data ? farmProfile(farm.name, farming.data.level, keys, farming.data.controlBody) : "";

  function toggle(key: SustainabilityKey) {
    const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
    // Show the tick at once; the answer brings the saved list.
    queryClient.setQueryData(getGetFarmSustainabilityQueryKey(farm.id), { keys: next });
    save.mutate({ farmId: farm.id, data: { keys: next } });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(profile);
      toast({ title: "Steckbrief kopiert", description: "Zum Einfügen auf eurer Website oder am Hofladen." });
    } catch {
      toast({ title: "Kopieren ging nicht", description: profile });
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 text-sm" data-testid="sustainability">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Flower2 className="h-4 w-4 text-primary" />
          Nachhaltigkeit
          {keys.length > 0 && <span className="ml-auto text-xs font-normal text-muted-foreground">{keys.length} von {SUSTAINABILITY.length}</span>}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">Was euer Hof für Natur und Klima tut – egal ob konventionell, naturnah oder Bio. Daraus wird der Hof-Steckbrief.</p>
      </div>
      <ul className="space-y-1">
        {SUSTAINABILITY.map((s) => (
          <li key={s.key}>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-muted/50">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                checked={keys.includes(s.key)}
                disabled={!canWrite || !query.data}
                onChange={() => toggle(s.key)}
              />
              <span>
                <span className="block">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {profile && (
        <div className="space-y-2 rounded-lg bg-primary/5 p-3" data-testid="farm-profile">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Hof-Steckbrief</p>
          <p>{profile}</p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void copy()}>
            <Copy className="h-3.5 w-3.5" />
            Text kopieren
          </Button>
        </div>
      )}
    </section>
  );
}
