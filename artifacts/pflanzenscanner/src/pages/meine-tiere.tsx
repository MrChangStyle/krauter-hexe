
import { Loader2 } from "lucide-react";
import { FarmAnimalsSection } from "@/components/farm-animals-section";
import { OrganicSpaceCard } from "@/components/organic-space-card";
import { useActiveFarm } from "@/hooks/use-active-farm";
import { PageHeader } from "@/components/page-header";
import { OrganicAreaSwitch } from "@/components/organic-area-switch";

/** /farm/tiere – all animals of the active farm, by group (the "Meine Tiere" button on the Tiere page). */
export default function MeineTierePage() {
  const { farm, failed } = useActiveFarm();
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="meine-tiere" subtitle={<>{farm ? farm.name : "Alle Tiere des Hofs, einzeln oder in Gruppen."}</>} />
      <OrganicAreaSwitch area="space" />
      {farm && <OrganicSpaceCard farm={farm} />}
      {farm ? <FarmAnimalsSection farm={farm} /> : failed ? <p className="text-sm text-muted-foreground">Die Farm konnte nicht geladen werden. Bist du online?</p> : <Loader2 className="h-6 w-6 animate-spin text-primary" />}
    </div>
  );
}
