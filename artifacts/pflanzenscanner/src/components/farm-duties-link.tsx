import { ShieldCheck } from "lucide-react";
import { useGetFarmDuties, type FarmSummary } from "@workspace/api-client-react";
import { HubTile } from "@/components/hub-tile";
import { openDuties } from "@/lib/duty-labels";

/** The farm page's tile to the Pflichten, with what is still open. */
export function FarmDutiesTile({ farm }: { farm: FarmSummary }) {
  const duties = useGetFarmDuties(farm.id);
  const open = duties.data ? openDuties(duties.data.duties) : 0;
  return (
    <HubTile
      href="/farm/pflichten"
      icon={ShieldCheck}
      label="Pflichten & Tierseuchen"
      hint="Anmeldung, Kasse, Stallpflicht"
      tone="bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300"
      badge={open > 0 ? `${open} offen` : null}
    />
  );
}
