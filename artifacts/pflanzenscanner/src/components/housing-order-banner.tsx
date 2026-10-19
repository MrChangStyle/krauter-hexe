import { Link } from "wouter";
import { Bird } from "lucide-react";
import { useGetFarmDuties, type FarmSummary } from "@workspace/api-client-react";
import { deDay } from "@/lib/medicine-labels";

/** A running Geflügelpest housing order, for everyone on the farm. */
export function HousingOrderBanner({ farm, link = false }: { farm: FarmSummary; link?: boolean }) {
  const duties = useGetFarmDuties(farm.id);
  const until = duties.data?.housingOrderUntil;
  if (!until) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border-2 border-red-600 bg-red-50 p-3 text-sm text-red-950 dark:bg-red-950/40 dark:text-red-100">
      <Bird className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <span className="font-semibold">Stallpflicht für Geflügel bis {deDay(until)}.</span> Hühner, Enten und Gänse nur in den Stall oder unter ein Dach mit Seitenschutz; Futter und Wasser nicht für Wildvögel erreichbar.{" "}
        {link && (
          <Link href="/farm/pflichten" className="underline">
            Pflichten
          </Link>
        )}
      </p>
    </div>
  );
}
