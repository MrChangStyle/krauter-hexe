import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Leaf, Loader2 } from "lucide-react";
import {
  getGetFarmFarmingQueryKey,
  getGetSettingsQueryKey,
  useGetFarmFarming,
  useSetFarmFarming,
  type FarmFarming,
  type FarmingLevel,
  type FarmSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FARMING_HINTS, FARMING_LABELS, FARMING_ORDER, certified } from "@/lib/farming-labels";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

/**
 * Bewirtschaftung (docs/bio.md): how the farm works – conventional (the
 * default, all advice as before), natural or organic. Admins switch it any
 * time; everyone else sees it.
 */
export function FarmFarmingCard({ farm }: { farm: FarmSummary }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useGetFarmFarming(farm.id, { query: { queryKey: getGetFarmFarmingQueryKey(farm.id) } });
  const [draft, setDraft] = useState<FarmFarming | null>(null);
  useEffect(() => setDraft(query.data ?? null), [query.data]);
  const save = useSetFarmFarming({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getGetFarmFarmingQueryKey(farm.id), data);
        // Pflanzendoc and Pflege-Guide follow the farm.
        void queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        toast({ title: "Gespeichert", description: `Bewirtschaftung: ${FARMING_LABELS[data.level]}` });
      },
      onError: (err) => toast({ title: errorText(err, "Das hat nicht geklappt."), variant: "destructive" }),
    },
  });
  const admin = farm.role === "admin";
  const current = query.data;

  if (!draft || !current) {
    return (
      <section className="rounded-xl border bg-card p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </section>
    );
  }

  const changed =
    draft.level !== current.level ||
    (certified(draft.level) && ((draft.controlBody ?? "") !== (current.controlBody ?? "") || (draft.organicSince ?? "") !== (current.organicSince ?? "")));

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 text-sm" data-testid="farm-farming">
      <div className="flex items-center gap-2">
        <Leaf className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Bewirtschaftung</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Bio ist eine Option, kein Muss: Konventionell bleibt alles wie gehabt. Ihr könnt jederzeit wechseln.
      </p>
      {admin ? (
        <fieldset className="space-y-2" aria-label="Bewirtschaftung">
          {FARMING_ORDER.map((level: FarmingLevel) => (
            <label key={level} className="flex cursor-pointer gap-3 rounded-lg border p-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                name="farming"
                className="mt-1 accent-[hsl(var(--primary))]"
                checked={draft.level === level}
                onChange={() => setDraft({ ...draft, level })}
              />
              <span>
                <span className="block font-medium">{FARMING_LABELS[level]}</span>
                <span className="block text-xs text-muted-foreground">{FARMING_HINTS[level]}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p>
          <span className="font-medium">{FARMING_LABELS[current.level]}</span>
          <span className="block text-xs text-muted-foreground">{FARMING_HINTS[current.level]}</span>
        </p>
      )}
      {certified(admin ? draft.level : current.level) &&
        (admin ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="farming-control">Kontrollstelle</Label>
              <Input
                id="farming-control"
                placeholder="DE-ÖKO-006"
                maxLength={40}
                value={draft.controlBody ?? ""}
                onChange={(e) => setDraft({ ...draft, controlBody: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="farming-since">Umstellung seit</Label>
              <Input
                id="farming-since"
                type="date"
                value={draft.organicSince ?? ""}
                onChange={(e) => setDraft({ ...draft, organicSince: e.target.value || null })}
              />
            </div>
          </div>
        ) : (
          (current.controlBody || current.organicSince) && (
            <p className="text-xs text-muted-foreground">
              {current.controlBody && <>Kontrollstelle {current.controlBody}</>}
              {current.controlBody && current.organicSince && " · "}
              {current.organicSince && <>Umstellung seit {current.organicSince.split("-").reverse().join(".")}</>}
            </p>
          )
        ))}
      {admin && changed && (
        <Button
          size="sm"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              farmId: farm.id,
              data: certified(draft.level)
                ? { level: draft.level, controlBody: draft.controlBody?.trim() || null, organicSince: draft.organicSince || null }
                : { level: draft.level },
            })
          }
        >
          {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Speichern
        </Button>
      )}
    </section>
  );
}
