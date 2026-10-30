import { Link } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { FarmAnimalsSection } from "@/components/farm-animals-section";
import { OrganicSpaceCard } from "@/components/organic-space-card";
import { useActiveFarm } from "@/hooks/use-active-farm";

/** /farm/tiere – all animals of the active farm, by group (the "Meine Tiere" button on the Tiere page). */
export default function MeineTierePage() {
  const { farm, failed } = useActiveFarm();
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/farm" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Tiere
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Meine Tiere</h1>
        <p className="mt-1 text-sm text-muted-foreground">{farm ? farm.name : "Alle Tiere des Hofs, einzeln oder in Gruppen."}</p>
      </div>
      {farm && <OrganicSpaceCard farm={farm} />}
      {farm ? <FarmAnimalsSection farm={farm} /> : failed ? <p className="text-sm text-muted-foreground">Die Farm konnte nicht geladen werden. Bist du online?</p> : <Loader2 className="h-6 w-6 animate-spin text-primary" />}
    </div>
  );
}
