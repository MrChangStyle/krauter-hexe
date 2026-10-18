import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";

/** Back link to the Pflanzen overview, used on its sub-pages. */
export function BackToPflanzen() {
  return (
    <Link
      href="/pflanzen"
      className="inline-flex items-center gap-1 h-9 text-sm font-semibold text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="w-4 h-4" />
      Pflanzen
    </Link>
  );
}
