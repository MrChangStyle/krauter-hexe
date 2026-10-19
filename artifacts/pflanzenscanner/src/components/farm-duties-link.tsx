import { Link } from "wouter";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { useGetFarmDuties, type FarmSummary } from "@workspace/api-client-react";
import { openDuties } from "@/lib/duty-labels";

/** The farm page's way to the Pflichten, with what is still open. */
export function FarmDutiesLink({ farm }: { farm: FarmSummary }) {
  const duties = useGetFarmDuties(farm.id);
  const open = duties.data ? openDuties(duties.data.duties) : 0;
  return (
    <Link href="/farm/pflichten" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50">
      <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Pflichten & Tierseuchen</span>
        <span className="block text-sm text-muted-foreground">Anmeldung, Tierseuchenkasse, Bestandsmeldung, Stallpflicht</span>
      </span>
      {open > 0 && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-medium text-amber-950">{open} offen</span>}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
