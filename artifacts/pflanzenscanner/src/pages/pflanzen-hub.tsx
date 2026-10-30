import { Link } from "wouter";
import { Sprout } from "lucide-react";
import { useGetPremium, useListMyFarms, useListMyScans, type ModuleId } from "@workspace/api-client-react";
import { HubGrid, HubTile } from "@/components/hub-tile";
import { GROW_ENABLED } from "@/lib/grow-labels";
import { useModules } from "@/hooks/use-modules";
import { farmModuleGranted, tierLabel } from "@/lib/modules";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { tileOf, type LookKey } from "@/lib/module-look";

/**
 * Pflanzen: the hub for everything around plants. Each tile opens one area;
 * the order follows the agreed Little Farming navigation (design "Option B").
 */
const AREAS: { module: ModuleId; look: LookKey }[] = [
  { module: "care-plan", look: "aufgaben" },
  { module: "plant-doc", look: "pflanzendoc" },
  { module: "pests", look: "schaedlinge" },
  { module: "lexicon", look: "lexikon" },
  { module: "herb-witch", look: "kraeuter" },
  { module: "garden", look: "beete" },
  // Grow sits right of the Beet-Architekt; builds without it (app stores) leave it out.
  ...(GROW_ENABLED ? [{ module: "grow" as const, look: "grow" as const }] : []),
  { module: "pantry", look: "vorrat" },
];

/** Top of the Pflanzen page, like "Meine Tiere" on Tiere: the way to all of your plants. */
function MyPlantsCard() {
  const { data: plants } = useListMyScans({ query: { queryKey: ["/api/plants/my-scans"] } });
  const n = plants?.length ?? 0;
  return (
    <Link
      href="/meine-pflanzen"
      className="block rounded-3xl bg-primary text-primary-foreground p-5 space-y-2 shadow-md active:scale-[0.99] transition-transform"
      data-testid="my-plants"
    >
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">Meine Pflanzen</span>
        <Sprout className="w-5 h-5 opacity-80" />
      </div>
      <p className="text-sm opacity-90">
        {!plants
          ? "Deine Scans und Sammlung – Zimmer, Balkon und Beet."
          : n === 0
            ? "Noch keine Pflanzen. Scanne deine erste – sie landet hier mit Steckbrief."
            : `${n} ${n === 1 ? "Pflanze" : "Pflanzen"} in deiner Sammlung – mit Steckbrief und Pflege`}
      </p>
    </Link>
  );
}

export default function PflanzenHubPage() {
  const { visible } = useModules();
  const premium = useGetPremium();
  // The Beet-Architekt belongs to the farm: hidden when not granted there (Modul-Freigaben).
  const farms = useListMyFarms();
  const farm = farms.data ? pickActiveFarm(farms.data, readActiveFarmId()) : null;
  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Pflanzen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alles rund um deine Pflanzen an einem Ort.
        </p>
      </div>

      {visible("my-plants") && <MyPlantsCard />}

      <HubGrid>
        {AREAS.filter((a) => visible(a.module) && farmModuleGranted(farm, a.module)).map(({ module, look }) => (
          <HubTile key={look} {...tileOf(look)} tag={tierLabel(module, !!premium.data?.active)} />
        ))}
      </HubGrid>
    </div>
  );
}
