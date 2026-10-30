import { Loader2 } from "lucide-react";
import { OrganicCheckCard } from "@/components/organic-check-card";
import { useActiveFarm } from "@/hooks/use-active-farm";
import { PageHeader } from "@/components/page-header";

/** /farm/bio-check – the Bio-Check of the active farm (a tile on the Tiere page, docs/bio.md). */
export default function BioCheckPage() {
  const { farm, failed } = useActiveFarm();
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="bio-check" subtitle={farm ? farm.name : undefined} />
      {farm ? (
        <OrganicCheckCard farm={farm} empty />
      ) : failed ? (
        <p className="text-sm text-muted-foreground">Die Farm konnte nicht geladen werden. Bist du online?</p>
      ) : (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      )}
    </div>
  );
}
