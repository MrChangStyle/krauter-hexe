import { Check, ChevronDown, FlaskConical, Home, Settings2, Users } from "lucide-react";
import { Link } from "wouter";
import { useGetDemoStatus, type FarmSummary } from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FARM_ROLE_LABELS } from "@/lib/active-farm";

/** One box of the Hof's top row (Farm, Pflanzenretter, Bewirtschaftung): label, value, one line. */
export const TOP_BOX = "flex min-w-0 flex-1 basis-0 flex-col gap-0.5 rounded-2xl border bg-card px-2.5 py-2.5 text-left shadow-sm active:scale-[0.98]";

export interface FarmGroups {
  own: FarmSummary[];
  demo: FarmSummary[];
  shared: FarmSummary[];
}

/** Own farms (admin) first, then the Demo-Hof, then the farms others shared. */
export function groupFarms(farms: FarmSummary[], demoFarmId: number | null): FarmGroups {
  const demo = farms.filter((f) => f.id === demoFarmId);
  const rest = farms.filter((f) => f.id !== demoFarmId);
  return { own: rest.filter((f) => f.role === "admin"), demo, shared: rest.filter((f) => f.role !== "admin") };
}

/** The line under a farm's name: whose it is and what the viewer may do. */
export function farmLine(f: FarmSummary, demoFarmId: number | null): string {
  if (f.id === demoFarmId) return "Beispieldaten";
  if (f.role === "admin") return "Mein Hof";
  return `${f.accessUntil ? "Vertretung" : "Geteilt"}${f.ownerName ? ` von ${f.ownerName}` : ""} · ${FARM_ROLE_LABELS[f.role]}`;
}

function iconFor(f: FarmSummary, demoFarmId: number | null) {
  if (f.id === demoFarmId) return FlaskConical;
  return f.role === "admin" ? Home : Users;
}

/**
 * On the Hof: one button "Wähle deine Farm" with the farm shown now; it opens
 * the list – own farms, the Demo-Hof, and the linked farms others shared.
 * One tap switches the whole Hof. Only with more than one farm.
 */
export function FarmSwitcher({
  farms,
  active,
  onSelect,
  compact = false,
}: {
  farms: FarmSummary[] | null;
  active: FarmSummary | null;
  onSelect: (id: number) => void;
  /** A small box for the top row of the Hof (next to Pflanzenretter and Bewirtschaftung). */
  compact?: boolean;
}) {
  const demo = useGetDemoStatus();
  if (!farms || farms.length < 2 || !active) return null;
  const demoId = demo.data?.farmId ?? null;
  const groups = groupFarms(farms, demoId);
  const ActiveIcon = iconFor(active, demoId);

  const section = (label: string, list: FarmSummary[]) =>
    list.length > 0 && (
      <>
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{label}</DropdownMenuLabel>
        {list.map((f) => {
          const Icon = iconFor(f, demoId);
          return (
            <DropdownMenuItem key={f.id} onSelect={() => onSelect(f.id)} className="gap-2.5 py-2" data-testid="farm-option">
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate font-medium">{f.name}</span>
                <span className="block text-[11px] text-muted-foreground">{farmLine(f, demoId)}</span>
              </span>
              {f.id === active.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </>
    );

  const trigger = compact ? (
    <DropdownMenuTrigger className={TOP_BOX} aria-label={`Wähle deine Farm – jetzt: ${active.name}`} data-testid="farm-switcher">
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <span className="truncate">Farm</span>
      </span>
      <span className="block truncate text-[13px] font-semibold">{active.name}</span>
      <span className="block truncate text-[11px] text-muted-foreground">{farmLine(active, demoId)}</span>
    </DropdownMenuTrigger>
  ) : null;

  return (
    <DropdownMenu>
      {trigger ?? (
      <DropdownMenuTrigger
        className="flex w-full items-center gap-3 rounded-2xl border bg-card px-3 py-2.5 text-left shadow-sm"
        aria-label={`Wähle deine Farm – jetzt: ${active.name}`}
        data-testid="farm-switcher"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ActiveIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[11px] text-muted-foreground">Wähle deine Farm</span>
          <span className="block truncate font-semibold">{active.name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{farmLine(active, demoId)}</span>
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align="start" className={compact ? "w-72 max-w-[calc(100vw-2rem)]" : "w-[var(--radix-dropdown-menu-trigger-width)]"}>
        {section(groups.own.length > 1 ? "Meine Farmen" : "Meine Farm", groups.own)}
        {groups.own.length > 0 && groups.shared.length > 0 && <DropdownMenuSeparator />}
        {section("Verknüpfte Höfe", groups.shared)}
        {groups.demo.length > 0 && <DropdownMenuSeparator />}
        {section("Zum Ausprobieren", groups.demo)}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2.5 text-xs text-muted-foreground">
          <Link href="/farm">
            <Settings2 className="h-4 w-4" />
            Farmen verwalten (umbenennen, löschen)
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
