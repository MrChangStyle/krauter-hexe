
import { Loader2 } from "lucide-react";
import { FarmTasksSection } from "@/components/farm-tasks-section";
import { useActiveFarm } from "@/hooks/use-active-farm";
import { PageHeader } from "@/components/page-header";

/** /farm/aufgaben – the Stall-Aufgaben of the active farm (a tile on the Tiere page). */
export default function FarmAufgabenPage() {
  const { farm, failed } = useActiveFarm();
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="stall-aufgaben" subtitle={<>{farm ? farm.name : "Füttern, Ausmisten, Eier sammeln – mit Erinnerung."}</>} />
      {farm ? <FarmTasksSection farm={farm} /> : failed ? <p className="text-sm text-muted-foreground">Die Farm konnte nicht geladen werden. Bist du online?</p> : <Loader2 className="h-6 w-6 animate-spin text-primary" />}
    </div>
  );
}
