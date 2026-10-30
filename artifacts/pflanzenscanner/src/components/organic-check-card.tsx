import { Link } from "wouter";
import { ChevronRight, FileText, Leaf } from "lucide-react";
import {
  getGetFarmExportQueryKey,
  getGetSeedOverviewQueryKey,
  getListFertilizingsQueryKey,
  getListHerdsQueryKey,
  getListRationsQueryKey,
  useGetFarmExport,
  useGetFarmFarming,
  useGetSeedOverview,
  useListFertilizings,
  useListHerds,
  useListRations,
  type FarmSummary,
} from "@workspace/api-client-react";
import { todayIso } from "@/lib/farm-labels";
import { FARMING_LABELS, ORGANIC_DISCLAIMER, certifiedIn } from "@/lib/farming-labels";
import { feedArea, fertilizerArea, seedArea, spaceArea, treatmentArea, type CheckStatus } from "@/lib/organic-check";
import { cn } from "@/lib/utils";

const LIGHT: Record<CheckStatus, { dot: string; label: string }> = {
  ok: { dot: "bg-emerald-500", label: "in Ordnung" },
  warn: { dot: "bg-red-600", label: "Handlungsbedarf" },
  open: { dot: "bg-amber-400", label: "unvollständig" },
};

/**
 * Bio-Check (docs/bio.md, B5) on the Tiere page, organic farms only: one light
 * per area; a tap opens where to fix it.
 */
export function OrganicCheckCard({ farm }: { farm: FarmSummary }) {
  const farming = useGetFarmFarming(farm.id);
  // Bio je Bereich: only the areas the farm keeps organic get a light.
  const f = farming.data;
  const feedOn = certifiedIn(f, "feed");
  const spaceOn = certifiedIn(f, "space");
  const treatmentsOn = certifiedIn(f, "treatments");
  const gardenOn = certifiedIn(f, "garden");
  const on = feedOn || spaceOn || treatmentsOn || gardenOn;
  const rations = useListRations(farm.id, { query: { enabled: feedOn, queryKey: getListRationsQueryKey(farm.id) } });
  const herds = useListHerds(farm.id, { query: { enabled: spaceOn, queryKey: getListHerdsQueryKey(farm.id) } });
  const health = useGetFarmExport(farm.id, { query: { enabled: treatmentsOn, queryKey: getGetFarmExportQueryKey(farm.id) } });
  const seeds = useGetSeedOverview(farm.id, { query: { enabled: gardenOn, retry: false, queryKey: getGetSeedOverviewQueryKey(farm.id) } });
  const fertilizings = useListFertilizings(farm.id, { query: { enabled: gardenOn, retry: false, queryKey: getListFertilizingsQueryKey(farm.id) } });
  if (!on) return null;

  const loading = rations.isLoading || herds.isLoading || health.isLoading || seeds.isLoading || fertilizings.isLoading;
  const areas = [
    ...(feedOn ? [feedArea(rations.data)] : []),
    ...(spaceOn ? [spaceArea(herds.data)] : []),
    ...(treatmentsOn ? [treatmentArea(health.data?.animals, health.data?.medicalRecords, todayIso())] : []),
    // Members without the garden module see neither light.
    ...(gardenOn && !seeds.isError ? [seedArea(seeds.data?.seeds)] : []),
    ...(gardenOn && !fertilizings.isError ? [fertilizerArea(fertilizings.data, todayIso())] : []),
  ];

  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm" data-testid="organic-check">
      <h2 className="flex items-center gap-2 font-semibold">
        <Leaf className="h-4 w-4 text-primary" />
        Bio-Check
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {FARMING_LABELS[farming.data!.level]}
          {farming.data!.controlBody ? ` · ${farming.data!.controlBody}` : ""}
        </span>
      </h2>
      {loading ? (
        <p className="text-xs text-muted-foreground">Wird geprüft …</p>
      ) : (
        <ul className="divide-y divide-border">
          {areas.map((a) => (
            <li key={a.key}>
              <Link href={a.href} className="flex items-center gap-3 py-2.5" data-testid={`check-${a.key}`}>
                <span className={cn("h-3 w-3 shrink-0 rounded-full", LIGHT[a.status].dot)} aria-label={LIGHT[a.status].label} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{a.label}</span>
                  <span className="block text-xs text-muted-foreground">{a.text}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{ORGANIC_DISCLAIMER}</p>
      <Link href="/farm/export" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
        <FileText className="h-3.5 w-3.5" />
        Bio-Dokumentation als PDF
      </Link>
    </section>
  );
}
