import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** "3 weitere anzeigen" / "Weniger anzeigen" under a shortened list or tile grid. */
export function ShowMoreButton({ hidden, expanded, onToggle }: { hidden: number; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
    >
      <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
      {expanded ? "Weniger anzeigen" : `${hidden} weitere anzeigen`}
    </button>
  );
}
