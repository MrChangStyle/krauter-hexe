import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Ruler } from "lucide-react";
import {
  getListHerdsQueryKey,
  useGetFarmFarming,
  useListHerds,
  useSetHerdSpace,
  type FarmSummary,
  type Herd,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { SPECIES_LABELS } from "@/lib/farm-labels";
import { certifiedIn } from "@/lib/farming-labels";
import { spaceCheck } from "@/lib/organic-space";
import { cn } from "@/lib/utils";

const m2 = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} m²`;

function Light({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="text-muted-foreground">–</span>;
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full", ok ? "bg-emerald-500" : "bg-red-600")} aria-label={ok ? "reicht" : "zu wenig"} />;
}

/** One area field: saved when it loses focus. */
function AreaInput({ label, value, disabled, onSave }: { label: string; value: number | null; disabled: boolean; onSave: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value).replace(".", ","));
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      className="h-9 w-20 text-right"
      placeholder="m²"
      disabled={disabled}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const v = text.trim() === "" ? null : Number(text.replace(",", "."));
        if (v !== null && !(v >= 0)) return setText(value == null ? "" : String(value).replace(".", ","));
        if (v !== value) onSave(v);
      }}
    />
  );
}

/**
 * Platz-Check (Bio, docs/bio.md – B4), only on organic farms: stall and
 * outdoor run of each group against the minimum areas per animal (Richtwerte).
 */
export function OrganicSpaceCard({ farm }: { farm: FarmSummary }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const farming = useGetFarmFarming(farm.id);
  const herds = useListHerds(farm.id);
  const save = useSetHerdSpace({
    mutation: {
      onSuccess: (h: Herd) => queryClient.setQueryData<Herd[]>(getListHerdsQueryKey(farm.id), (old) => old?.map((o) => (o.id === h.id ? h : o))),
      onError: () => toast({ title: "Nicht gespeichert", variant: "destructive" }),
    },
  });
  if (!certifiedIn(farming.data, "space") || !herds.data?.length) return null;
  const canWrite = farm.role !== "guest";

  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm" data-testid="organic-space">
      <h2 className="flex items-center gap-2 font-semibold">
        <Ruler className="h-4 w-4 text-primary" />
        Platz-Check (Bio)
      </h2>
      <p className="text-xs text-muted-foreground">Stallfläche und Auslauf je Gruppe – die App vergleicht mit den Mindestflächen je Tier der EU-Öko-Verordnung (Richtwerte für ausgewachsene Tiere).</p>
      <ul className="divide-y divide-border">
        {herds.data.map((h) => {
          const check = spaceCheck(h.species, h.animalCount, h.stallM2, h.runM2);
          return (
            <li key={h.id} className="space-y-1.5 py-2.5" data-testid={`space-${h.id}`}>
              <p className="font-medium">
                {h.name} <span className="font-normal text-muted-foreground">· {h.animalCount} {SPECIES_LABELS[h.species]}</span>
              </p>
              {!check ? (
                <p className="text-xs text-muted-foreground">
                  {h.animalCount === 0 ? "Noch keine Tiere in der Gruppe." : `Für ${SPECIES_LABELS[h.species]} hat die App noch keine Bio-Mindestflächen.`}
                </p>
              ) : (
                <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-2 gap-y-1 text-xs">
                  <span>Stall</span>
                  <AreaInput label={`Stallfläche ${h.name}`} value={h.stallM2} disabled={!canWrite || save.isPending} onSave={(v) => save.mutate({ farmId: farm.id, herdId: h.id, data: { stallM2: v } })} />
                  <span className="text-muted-foreground">mind. {m2(check.stallNeeded)}</span>
                  <Light ok={check.stallOk} />
                  <span>Auslauf</span>
                  <AreaInput label={`Auslauf ${h.name}`} value={h.runM2} disabled={!canWrite || save.isPending} onSave={(v) => save.mutate({ farmId: farm.id, herdId: h.id, data: { runM2: v } })} />
                  <span className="text-muted-foreground">mind. {m2(check.runNeeded)}</span>
                  <Light ok={check.runOk} />
                  <span className="col-span-4 text-muted-foreground">Richtwert für {check.rule.basis}.</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
