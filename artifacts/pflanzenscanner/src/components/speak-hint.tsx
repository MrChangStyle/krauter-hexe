import { useState, type ReactNode } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Einfach reinsprechen" above an input: one line with an info bubble that
 * opens the explanation, so the text does not stand open all the time.
 */
export function SpeakHint({ title, tone, testId, children }: { title: string; tone: "green" | "orange"; testId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const colors =
    tone === "green"
      ? { box: "bg-primary/10", icon: "text-primary" }
      : { box: "bg-orange-50 dark:bg-orange-950/40", icon: "text-orange-600" };
  return (
    <div className={cn("rounded-xl text-xs", colors.box)} data-testid={testId}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left">
        <Info className={cn("h-3.5 w-3.5 shrink-0", colors.icon)} />
        <span className="min-w-0 flex-1 font-medium leading-snug">{title}</span>
        <span className="shrink-0 text-muted-foreground">{open ? "Weniger" : "So geht's"}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-2.5 pb-2 pl-7 leading-relaxed">{children}</div>}
    </div>
  );
}
