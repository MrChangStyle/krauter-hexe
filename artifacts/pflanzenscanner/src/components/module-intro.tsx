import { useState } from "react";
import { Link } from "wouter";
import { ChevronDown, CircleHelp } from "lucide-react";
import { helpForPath } from "@/lib/help";
import { cn } from "@/lib/utils";

const KEY = (id: string) => `lf-intro-closed-${id}`;

function closedBefore(id: string): boolean {
  try {
    return localStorage.getItem(KEY(id)) === "1";
  } catch {
    return false;
  }
}

/**
 * „So funktioniert's“ at the top of every module page (from lib/help.ts, the
 * same text as in the help area). Open until it is closed once on this device.
 */
export function ModuleIntro({ path }: { path: string }) {
  const found = helpForPath(path);
  const [open, setOpen] = useState(() => (found ? !closedBefore(found.id) : false));
  if (!found) return null;
  const { id, entry } = found;

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      if (next) localStorage.removeItem(KEY(id));
      else localStorage.setItem(KEY(id), "1");
    } catch {
      // Private mode: it opens again next time.
    }
  }

  return (
    <section className="mx-4 mt-4 rounded-xl border border-primary/20 bg-primary/5 text-sm" data-testid="module-intro">
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left" aria-expanded={open} onClick={toggle}>
        <CircleHelp className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1 font-medium">So funktioniert’s: {entry.title}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          <p className="text-muted-foreground">{entry.intro}</p>
          <ol className="list-decimal space-y-1 pl-5">
            {entry.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <Link href={`/hilfe#${id}`} className="inline-block text-xs font-medium text-primary underline">
            Fragen und mehr in der Hilfe
          </Link>
        </div>
      )}
    </section>
  );
}
