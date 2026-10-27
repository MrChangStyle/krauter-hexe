import { Home, Users } from "lucide-react";
import type { FarmSummary } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { FARM_ROLE_LABELS } from "@/lib/active-farm";

/** Own farms (admin) first, then the ones shared with the person. */
export function sortFarms(farms: FarmSummary[]): FarmSummary[] {
  return [...farms].sort((a, b) => Number(b.role === "admin") - Number(a.role === "admin"));
}

/**
 * On the Hof: the own farm and every farm someone shared – one tap switches
 * the whole Hof (weather, Hof-Aufgaben, widgets). Only with more than one.
 */
export function FarmSwitcher({ farms, active, onSelect }: { farms: FarmSummary[] | null; active: FarmSummary | null; onSelect: (id: number) => void }) {
  if (!farms || farms.length < 2 || !active) return null;
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Hof wählen" data-testid="farm-switcher">
      {sortFarms(farms).map((f) => {
        const own = f.role === "admin";
        const selected = f.id === active.id;
        const Icon = own ? Home : Users;
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(f.id)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm transition",
              selected ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-card",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="leading-tight">
              <span className="block max-w-[11rem] truncate font-medium">{f.name}</span>
              <span className={cn("block text-[11px]", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {own ? "Mein Hof" : `${f.accessUntil ? "Vertretung" : "Geteilt"}${f.ownerName ? ` von ${f.ownerName}` : ""} · ${FARM_ROLE_LABELS[f.role]}`}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
