import { Link, useLocation, useSearch } from "wouter";
import { Bug, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MeineInsektenTab } from "@/pages/mehr";
import { BackToPflanzen } from "@/components/back-to-pflanzen";
import { PageHeader } from "@/components/page-header";
import { BeneficialsHub, GUIDE_HREF } from "@/components/beneficials-guide";
import { cn } from "@/lib/utils";

/**
 * Schädlinge & Nützlinge: insects on house and garden plants - identify them
 * and get biological or chemical treatment tips; the tab "Nützlinge fördern"
 * (?tab=nuetzlinge) leads to the guide pages (docs/schaedlinge.md).
 */
export default function SchaedlingePage() {
  const guide = new URLSearchParams(useSearch()).get("tab") === "nuetzlinge";
  const [, setLocation] = useLocation();

  const tabs = [
    { href: "/schaedlinge", label: "Meine Insekten", icon: Bug, active: !guide },
    { href: GUIDE_HREF, label: "Nützlinge fördern", icon: Leaf, active: guide },
  ];

  return (
    <div className="flex flex-col flex-1">
      <div className="px-4 pt-4 space-y-4">
        <PageHeader look="schaedlinge" subtitle="Insekten bestimmen, Schädlinge biologisch bekämpfen und Nützlinge in den Garten holen." />
        <Button asChild className="w-full h-12 gap-2 bg-amber-600 hover:bg-amber-700 text-white">
          <Link href="/insekten-scanner">
            <Bug className="w-5 h-5" />
            Insekt bestimmen
          </Link>
        </Button>
      </div>
      {/* Tab bar – the same as in the Lexikon. */}
      <div className="sticky top-0 z-10 mt-2 bg-background border-b border-border px-4" role="tablist">
        <div className="flex">
          {tabs.map((t) => (
            <button
              key={t.href}
              type="button"
              role="tab"
              aria-selected={t.active}
              onClick={() => setLocation(t.href, { replace: true })}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors",
                t.active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pt-4 pb-4">{guide ? <BeneficialsHub /> : <MeineInsektenTab />}</div>
    </div>
  );
}
