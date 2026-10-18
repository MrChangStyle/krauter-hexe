import { Link } from "wouter";
import { Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MeineInsektenTab } from "@/pages/mehr";
import { BackToPflanzen } from "@/components/back-to-pflanzen";

/**
 * Schädlinge & Nützlinge: insects on house and garden plants - identify them
 * and get biological or chemical treatment tips.
 */
export default function SchaedlingePage() {
  return (
    <div className="px-4 pt-4 pb-4 space-y-5">
      <BackToPflanzen />
      <div>
        <h1 className="text-2xl font-bold">Schädlinge &amp; Nützlinge</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Insekten an Haus- und Gartenpflanzen bestimmen – mit biologischen und
          chemischen Bekämpfungstipps.
        </p>
      </div>
      <Button asChild className="w-full h-12 gap-2 bg-amber-600 hover:bg-amber-700 text-white">
        <Link href="/insekten-scanner">
          <Bug className="w-5 h-5" />
          Insekt bestimmen
        </Link>
      </Button>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Meine Insekten</h2>
        <MeineInsektenTab />
      </section>
    </div>
  );
}
