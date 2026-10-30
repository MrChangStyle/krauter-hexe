
import { Loader2 } from "lucide-react";
import { FarmExportCard } from "@/components/farm-export-card";
import { useActiveFarm } from "@/hooks/use-active-farm";
import { PageHeader } from "@/components/page-header";

/** /farm/export – Bestandsliste and medicine history for the Veterinäramt (a tile on the Tiere page). */
export default function FarmExportPage() {
  const { farm, failed } = useActiveFarm();
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="export" subtitle={<>{farm ? farm.name : "Bestandsliste und Medizin-Historie."}</>} />
      {farm ? <FarmExportCard farm={farm} /> : failed ? <p className="text-sm text-muted-foreground">Die Farm konnte nicht geladen werden. Bist du online?</p> : <Loader2 className="h-6 w-6 animate-spin text-primary" />}
    </div>
  );
}
