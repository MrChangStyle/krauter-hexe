import { Link, useLocation, useSearch } from "wouter";
import { Bug, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MeineInsektenTab } from "@/pages/mehr";
import { BackToPflanzen } from "@/components/back-to-pflanzen";
import { BeneficialsGuide } from "@/components/beneficials-guide";

/**
 * Schädlinge & Nützlinge: insects on house and garden plants - identify them
 * and get biological or chemical treatment tips; the Nützlinge-Ratgeber shows
 * which beneficials help and how to attract them (docs/schaedlinge.md).
 * ?tab=nuetzlinge opens the guide, with &problem=<id> or &nuetzling=<id>.
 */
export default function SchaedlingePage() {
  const params = new URLSearchParams(useSearch());
  const [, setLocation] = useLocation();
  const guide = params.get("tab") === "nuetzlinge";

  const tabs = [
    { id: "insekten", label: "Meine Insekten", icon: Bug, active: !guide },
    { id: "nuetzlinge", label: "Nützlinge fördern", icon: Leaf, active: guide },
  ];

  return (
    <div className="px-4 pt-4 pb-4 space-y-5">
      <BackToPflanzen />
      <div>
        <h1 className="text-2xl font-bold">Schädlinge &amp; Nützlinge</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Insekten an Haus- und Gartenpflanzen bestimmen – mit biologischen und
          chemischen Bekämpfungstipps – und Nützlinge gezielt in den Garten holen.
        </p>
      </div>
      <Button asChild className="w-full h-12 gap-2 bg-amber-600 hover:bg-amber-700 text-white">
        <Link href="/insekten-scanner">
          <Bug className="w-5 h-5" />
          Insekt bestimmen
        </Link>
      </Button>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.active}
            onClick={() => setLocation(t.id === "nuetzlinge" ? "/schaedlinge?tab=nuetzlinge" : "/schaedlinge", { replace: true })}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${t.active ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>
      {guide ? (
        <BeneficialsGuide key={params.toString()} initialProblem={params.get("problem")} initialBeneficial={params.get("nuetzling")} />
      ) : (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Meine Insekten</h2>
          <MeineInsektenTab />
        </section>
      )}
    </div>
  );
}
