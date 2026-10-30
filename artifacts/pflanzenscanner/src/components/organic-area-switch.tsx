import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Leaf } from "lucide-react";
import {
  getGetFarmFarmingQueryKey,
  getGetSettingsQueryKey,
  useGetFarmFarming,
  useSetFarmFarming,
  type OrganicArea,
} from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";
import { useActiveFarm } from "@/hooks/use-active-farm";
import { useToast } from "@/hooks/use-toast";
import { FARMING_LABELS, ORGANIC_AREAS, organicAreasFor } from "@/lib/farming-labels";
import { cn } from "@/lib/utils";
import { TOP_BOX } from "@/components/farm-switcher";

const SETTINGS = "/team/bewirtschaftung";

/**
 * Bio right where it applies (docs/bio.md): one line at the top of every
 * module with Bio rules. It says whether Bio is on for this area and lets an
 * admin switch it here; on a conventional farm it points to where the farm
 * switches to Bio. `farmId` picks another of the account's farms than the
 * active one (e.g. the farm of an animal).
 */
export function OrganicAreaSwitch({ area, farmId }: { area: OrganicArea; farmId?: number }) {
  const { farm: active, farms } = useActiveFarm();
  const farm = farmId ? (farms?.find((f) => f.id === farmId) ?? null) : active;
  const id = farm?.id ?? 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const farming = useGetFarmFarming(id, { query: { queryKey: getGetFarmFarmingQueryKey(id), enabled: !!farm } });
  const save = useSetFarmFarming({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getGetFarmFarmingQueryKey(id), data);
        // Every Bio place of the farm reads the same setting.
        void queryClient.invalidateQueries();
        void queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
      onError: () => toast({ title: "Nicht gespeichert", description: "Bitte versuche es noch einmal.", variant: "destructive" }),
    },
  });
  const f = farming.data;
  if (!farm || !f) return null;

  const meta = ORGANIC_AREAS.find((a) => a.key === area)!;
  const offered = organicAreasFor(f.level).some((a) => a.key === area);
  const on = offered && !f.organicOff.includes(area);
  const admin = farm.role === "admin";

  if (!offered) {
    // Conventional, or naturnah where this area's rules only start with Bio.
    const text = f.level === "conventional" ? "Konventionell – Bio ist aus." : `${FARMING_LABELS[f.level]} – die Bio-Regeln für ${meta.label} gelten ab „Bio“.`;
    return (
      <Link
        href={SETTINGS}
        className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40"
        data-testid={`organic-area-${area}`}
      >
        <Leaf className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">{text}</span>
        <span className="shrink-0 font-medium text-primary">{admin ? "Auf Bio umstellen" : "Bewirtschaftung"}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary" />
      </Link>
    );
  }

  return (
    <div
      className={cn("flex items-center gap-3 rounded-xl border px-3 py-2 text-sm", on ? "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/30" : "bg-card")}
      data-testid={`organic-area-${area}`}
    >
      <Leaf className={cn("h-4 w-4 shrink-0", on ? "text-green-700 dark:text-green-400" : "text-muted-foreground")} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{on ? `Bio: ${meta.label}` : `${meta.label}: konventionell`}</span>
        <span className="block text-xs text-muted-foreground">
          {on ? meta.hint : "Bio für diesen Bereich ist aus."}{" "}
          <Link href={SETTINGS} className="underline underline-offset-2">
            Alle Bereiche
          </Link>
        </span>
      </span>
      {admin ? (
        <Switch
          checked={on}
          disabled={save.isPending}
          aria-label={`Bio für ${meta.label}`}
          onCheckedChange={(v) =>
            save.mutate({
              farmId: farm.id,
              data: { organicOff: v ? f.organicOff.filter((k) => k !== area) : [...f.organicOff, area] },
            })
          }
        />
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">{on ? "an" : "aus"}</span>
      )}
    </div>
  );
}

/** Hof start page, top row: Bewirtschaftung with the current level and the way to Bio (docs/bio.md). */
export function FarmingStrip() {
  const { farm } = useActiveFarm();
  const id = farm?.id ?? 0;
  const farming = useGetFarmFarming(id, { query: { queryKey: getGetFarmFarmingQueryKey(id), enabled: !!farm } });
  const f = farming.data;
  if (!farm || !f) return null;
  const areas = organicAreasFor(f.level);
  const on = areas.filter((a) => !f.organicOff.includes(a.key)).length;
  const bio = f.level !== "conventional";
  return (
    <Link
      href={SETTINGS}
      className={cn(TOP_BOX, bio && "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/30")}
      data-testid="hof-farming"
    >
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <span className="truncate">Bewirtschaftung</span>
      </span>
      <span className="block truncate text-[13px] font-semibold">{bio ? FARMING_LABELS[f.level].replace(" (EU-Öko-Verordnung)", "") : "Konventionell"}</span>
      <span className="block truncate text-[11px] text-muted-foreground">{bio ? `Bio in ${on} von ${areas.length}` : "Auf Bio wechseln"}</span>
    </Link>
  );
}
