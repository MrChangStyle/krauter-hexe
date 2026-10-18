import { Link } from "wouter";
import {
  BookOpen,
  Bug,
  CalendarCheck,
  ChevronRight,
  Fence,
  Sparkles,
  Sprout,
  Stethoscope,
} from "lucide-react";
import { useListTasks } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

/**
 * Pflanzen: the hub for everything around plants. Each tile opens one area;
 * the order follows the agreed Little Farming navigation (design "Option B").
 */
const AREAS = [
  {
    href: "/meine-pflanzen",
    icon: Sprout,
    label: "Meine Pflanzen",
    hint: "Scans, Zimmer, Beet",
    tone: "bg-lime-100 text-lime-800 dark:bg-lime-950/50 dark:text-lime-300",
  },
  {
    href: "/aufgaben",
    icon: CalendarCheck,
    label: "Pflegeplan",
    hint: "Aufgaben & Erinnerungen",
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  },
  {
    href: "/pflanzendoc",
    icon: Stethoscope,
    label: "Pflanzendoc",
    hint: "Diagnose & Pflege-Guide",
    tone: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
  },
  {
    href: "/schaedlinge",
    icon: Bug,
    label: "Schädlinge & Nützlinge",
    hint: "Bio & chemisch",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  },
  {
    href: "/lexikon",
    icon: BookOpen,
    label: "Lexikon",
    hint: "Alle Arten · mit Pilzen",
    tone: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200",
  },
  {
    href: "/kraeuter-hexe",
    icon: Sparkles,
    label: "Kräuter-Hexe",
    hint: "Heilkräuter-Ratgeber",
    tone: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  },
] as const;

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
  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Pflanzen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alles rund um deine Pflanzen an einem Ort.
        </p>
      </div>

      <TodayCard />

      <div className="grid grid-cols-2 gap-3">
        {AREAS.map(({ href, icon: Icon, label, hint, tone }) => (
          <Link
            key={href}
            href={href}
            className="rounded-2xl border bg-card p-4 flex flex-col gap-3 hover:shadow-md active:scale-[0.98] transition-all"
          >
            <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center", tone)}>
              <Icon className="w-5 h-5" strokeWidth={2} />
            </span>
            <span>
              <span className="block text-sm font-semibold leading-tight">{label}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>
            </span>
          </Link>
        ))}
      </div>

      <Link
        href="/beete"
        className="rounded-2xl border bg-card p-4 flex items-center gap-3 hover:shadow-md active:scale-[0.98] transition-all"
      >
        <span className="w-10 h-10 rounded-xl bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 flex items-center justify-center shrink-0">
          <Fence className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold">Beet-Architekt</span>
          <span className="block text-xs text-muted-foreground">Beete anlegen · Standort, Boden, Frosttermine</span>
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </Link>
    </div>
  );
}
