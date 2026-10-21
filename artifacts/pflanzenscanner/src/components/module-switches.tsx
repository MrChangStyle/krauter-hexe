import { useQueryClient } from "@tanstack/react-query";
import { getGetSettingsQueryKey, useGetPremium, useSetSettings, type ModuleId } from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useModules } from "@/hooks/use-modules";
import { GROW_ENABLED } from "@/lib/grow-labels";
import { MODULES, tierLabel, toggleModule, type ModuleArea } from "@/lib/modules";
import { cn } from "@/lib/utils";

const AREAS: { area: ModuleArea; label: string }[] = [
  { area: "pflanzen", label: "Pflanzen" },
  { area: "tiere", label: "Tiere" },
];

/** The switches of "Meine Module", also used by the first-start assistant. Saves each flip right away. */
export function ModuleSwitches() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { settings, hidden } = useModules();
  const premium = useGetPremium();
  const save = useSetSettings({
    mutation: {
      onSuccess: (data) => queryClient.setQueryData(getGetSettingsQueryKey(), data),
      onError: () => toast({ title: "Nicht gespeichert", description: "Bitte versuche es noch einmal.", variant: "destructive" }),
    },
  });
  const flip = (id: ModuleId) => save.mutate({ data: { hiddenModules: toggleModule(hidden, id) } });

  if (!settings.data) return null;
  return (
    <>
      {AREAS.map(({ area, label }) => {
        const areaDef = MODULES.find((m) => m.area === area && m.isArea)!;
        const areaOn = !hidden.includes(areaDef.id);
        return (
          <section key={area} className="space-y-2" data-testid={`module-${area}`}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{label}</h2>
            <ul className="divide-y rounded-xl border bg-card">
              {MODULES.filter((m) => m.area === area && (m.id !== "grow" || GROW_ENABLED)).map((m) => {
                const on = !hidden.includes(m.id);
                const tag = tierLabel(m.id, !!premium.data?.active);
                const muted = !m.isArea && !areaOn;
                return (
                  <li key={m.id} className={cn("flex items-center gap-3 px-3 py-2.5", m.isArea && "bg-muted/40")}>
                    <span className={cn("min-w-0 flex-1", muted && "opacity-50")}>
                      <span className={cn("block text-sm", m.isArea ? "font-semibold" : "font-medium")}>
                        {m.label}
                        {tag && <span className="ml-1.5 rounded-full border border-primary/40 px-1.5 py-px text-[10px] font-medium text-primary">{tag}</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">{m.hint}</span>
                    </span>
                    <Switch checked={on} disabled={save.isPending || muted} aria-label={`${m.label} anzeigen`} onCheckedChange={() => flip(m.id)} />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
