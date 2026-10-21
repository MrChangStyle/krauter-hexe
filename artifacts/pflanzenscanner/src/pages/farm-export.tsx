import { Link } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { FarmExportCard } from "@/components/farm-export-card";
import { useActiveFarm } from "@/hooks/use-active-farm";

/** /farm/export – Bestandsliste and medicine history for the Veterinäramt (a tile on the Tiere page). */
export default function FarmExportPage() {
  const { farm, failed } = useActiveFarm();
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/farm" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Tiere
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Veterinäramt-Export</h1>
        <p className="mt-1 text-sm text-muted-foreground">{farm ? farm.name : "Bestandsliste und Medizin-Historie."}</p>
      </div>
      {farm ? <FarmExportCard farm={farm} /> : failed ? <p className="text-sm text-muted-foreground">Die Farm konnte nicht geladen werden. Bist du online?</p> : <Loader2 className="h-6 w-6 animate-spin text-primary" />}
    </div>
  );
}
