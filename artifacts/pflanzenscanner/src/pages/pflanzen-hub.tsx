import { Link } from "wouter";
import {
  BookOpen,
  Bug,
  CalendarCheck,
  ChevronRight,
  Fence,
  Leaf,
  Sparkles,
  Sprout,
  Stethoscope,
} from "lucide-react";
import { useGetPremium, useListMyFarms, useListTasks, type ModuleId } from "@workspace/api-client-react";
import { HubGrid, HubTile } from "@/components/hub-tile";
import { GROW_ENABLED } from "@/lib/grow-labels";
import { useModules } from "@/hooks/use-modules";
import { farmModuleGranted, tierLabel } from "@/lib/modules";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";

/**
 * Pflanzen: the hub for everything around plants. Each tile opens one area;
 * the order follows the agreed Little Farming navigation (design "Option B").
 */
const AREAS: { module: ModuleId; href: string; icon: typeof Sprout; label: string; hint: string; tone: string }[] = [
  {
    module: "my-plants",
    href: "/meine-pflanzen",
    icon: Sprout,
    label: "Meine Pflanzen",
    hint: "Scans, Zimmer, Beet",
    tone: "bg-lime-100 text-lime-800 dark:bg-lime-950/50 dark:text-lime-300",
  },
  {
    module: "care-plan",
    href: "/aufgaben",
    icon: CalendarCheck,
    label: "Pflegeplan",
    hint: "Aufgaben & Erinnerungen",
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  },
  {
    module: "plant-doc",
    href: "/pflanzendoc",
    icon: Stethoscope,
    label: "Pflanzendoc",
    hint: "Diagnose & Pflege-Guide",
    tone: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
  },
  {
    module: "pests",
    href: "/schaedlinge",
    icon: Bug,
    label: "Schädlinge & Nützlinge",
    hint: "Bio & chemisch",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  },
  {
    module: "lexicon",
    href: "/lexikon",
    icon: BookOpen,
    label: "Lexikon",
    hint: "Alle Arten · mit Pilzen",
    tone: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200",
  },
  {
    module: "herb-witch",
    href: "/kraeuter-hexe",
    icon: Sparkles,
    label: "Kräuter-Hexe",
    hint: "Heilkräuter-Ratgeber",
    tone: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  },
  {
    module: "garden",
    href: "/beete",
    icon: Fence,
    label: "Beet-Architekt",
    hint: "Beete, Standort, Saatgut",
    tone: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
  },
  // Grow sits right of the Beet-Architekt; builds without it (app stores) leave it out.
  ...(GROW_ENABLED
    ? [
        {
          module: "grow" as const,
          href: "/grow",
          icon: Leaf,
          label: "Grow",
          hint: "Eigenanbau ab 18",
          tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
        },
      ]
    : []),
];

function TodayCard() {
  const { data: tasks } = useListTasks();
  const active = (tasks ?? []).filter((t) => t.isActive);
  return (
    <Link
      href="/aufgaben"
      className="block rounded-3xl bg-primary text-primary-foreground p-5 space-y-2 shadow-md active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">Pflegeplan</span>
        <ChevronRight className="w-5 h-5 opacity-80" />
      </div>
      <p className="text-sm opacity-90">
        {active.length === 0
          ? "Noch keine Pflegeaufgaben. Lege Gießen, Düngen oder Besprühen mit Erinnerung an."
          : `${active.length} ${active.length === 1 ? "aktive Aufgabe" : "aktive Aufgaben"} für deine Pflanzen`}
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

      {visible("care-plan") && <TodayCard />}

      <HubGrid>
        {AREAS.filter((a) => visible(a.module) && farmModuleGranted(farm, a.module)).map(({ module, ...area }) => (
          <HubTile key={area.href} {...area} tag={tierLabel(module, !!premium.data?.active)} />
        ))}
      </HubGrid>
    </div>
  );
}
