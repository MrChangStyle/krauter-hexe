import { Link } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { FarmTasksSection } from "@/components/farm-tasks-section";
import { useActiveFarm } from "@/hooks/use-active-farm";

/** /farm/aufgaben – the Stall-Aufgaben of the active farm (a tile on the Tiere page). */
export default function FarmAufgabenPage() {
  const { farm, failed } = useActiveFarm();
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/farm" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Tiere
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Stall-Aufgaben</h1>
        <p className="mt-1 text-sm text-muted-foreground">{farm ? farm.name : "Füttern, Ausmisten, Eier sammeln – mit Erinnerung."}</p>
      </div>
      {farm ? <FarmTasksSection farm={farm} /> : failed ? <p className="text-sm text-muted-foreground">Die Farm konnte nicht geladen werden. Bist du online?</p> : <Loader2 className="h-6 w-6 animate-spin text-primary" />}
    </div>
  );
}
