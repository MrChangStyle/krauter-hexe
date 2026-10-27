import { useState, type ComponentType, type ReactNode } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  Baby,
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Fence,
  Leaf,
  MapPin,
  PawPrint,
  PiggyBank,
  SlidersHorizontal,
  Pill,
  ShieldCheck,
  Sun,
  Trophy,
  Wheat,
  Wind,
} from "lucide-react";
import {
  useGetDashboard,
  useGetFarmDuties,
  useGetFarmWeather,
  useGetFeedStock,
  useGetGardenCalendar,
  useGetGrowOverview,
  useGetLeaderboard,
  useGetSeedOverview,
  useGetYieldOverview,
  useListBreeding,
  useListFarmAnimals,
  useListFarmTasks,
  useListMedicines,
  useListTasks,
  type DayForecast,
  type FarmSummary,
} from "@workspace/api-client-react";
import { useActiveFarm } from "@/hooks/use-active-farm";
import { useModules } from "@/hooks/use-modules";
import { WIDGET_MODULE, farmModuleGranted } from "@/lib/modules";
import { HofTools } from "@/components/hof-tasks";
import { FarmSwitcher } from "@/components/farm-switcher";
import { DashboardEditor } from "@/components/dashboard-editor";
import { ALERT_STYLES, AlertBox, LocationForm } from "@/components/farm-weather-card";
import { effectiveLayout, plantTaskDue, topCounts, widgetsOf, type WidgetArea, type WidgetId } from "@/lib/dashboard";
import { openDuties, speciesCount } from "@/lib/duty-labels";
import { GROW_ENABLED } from "@/lib/grow-labels";
import { deDay } from "@/lib/medicine-labels";
import { ALERT_LEVEL_LABELS, alertWindow, berlinToday, dayLabel, tempText } from "@/lib/weather-labels";
import { euro } from "@/lib/yield-labels";
import { cn } from "@/lib/utils";
import { TesterNotice } from "@/components/tester-notice";

// ── Weather ──────────────────────────────────────────────────────────────────

const WEATHER_ICONS: Record<DayForecast["icon"], typeof Sun> = { sun: Sun, cloud: Cloud, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };

/**
 * One slim line: today big, the next two days small, the first warning. A tap
 * opens the week – a row per day – with all warnings and the place.
 */
function WeatherStrip({ farm }: { farm: FarmSummary }) {
  const weather = useGetFarmWeather(farm.id);
  const [open, setOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const isAdmin = farm.role === "admin";
  const data = weather.data;
  if (!data) return <div className="h-[72px] rounded-2xl border bg-card animate-pulse" />;
  if (!data.location) {
    return (
      <div className="space-y-2 rounded-2xl border bg-card px-4 py-3 text-sm" data-testid="hof-weather">
        <p className="flex items-center gap-2 font-medium">
          <Sun className="h-5 w-5 text-amber-500" />
          Wetter für deinen Hof
        </p>
        {isAdmin ? (
          <>
            <p className="text-muted-foreground">Mit dem Standort warnt die App vor Frost, Hitze, Sturm und Starkregen – mit Tipps für Tiere und Garten.</p>
            <LocationForm farm={farm} />
          </>
        ) : (
          <p className="text-muted-foreground">Ein Admin des Hofs kann den Standort festlegen.</p>
        )}
      </div>
    );
  }
  if (data.days.length === 0) {
    return (
      <p className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground" data-testid="hof-weather">
        <Cloud className="h-5 w-5" />
        Der Wetterdienst ist gerade nicht erreichbar.
      </p>
    );
  }
  const today = berlinToday();
  // A server from before the DWD warnings sends none.
  const alerts = data.alerts ?? [];
  const [first, ...rest] = data.days;
  const Icon = WEATHER_ICONS[first!.icon];
  const lows = data.days.map((d) => d.minTemp);
  const highs = data.days.map((d) => d.maxTemp);
  const lo = Math.min(...lows);
  const span = Math.max(1, Math.max(...highs) - lo);
  return (
    <div className="rounded-2xl border bg-card" data-testid="hof-weather">
      <button type="button" className="block w-full px-4 py-3 text-left" aria-expanded={open} aria-label="Wetter der Woche" onClick={() => setOpen(!open)}>
        <span className="flex items-center gap-3">
          <Icon className={cn("h-9 w-9 shrink-0", first!.icon === "sun" ? "text-amber-500" : "text-sky-600")} />
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold leading-tight tabular-nums">
              {tempText(first!.maxTemp)} <span className="text-sm font-normal text-muted-foreground">/ {tempText(first!.minTemp)}</span>
            </span>
            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              {data.location.postalCode ? `PLZ ${data.location.postalCode}` : "Hof"} · heute
              {first!.precipitationMm >= 0.5 && ` · ${mm(first!.precipitationMm)}`}
            </span>
          </span>
          {!open && (
            <span className="flex shrink-0 gap-3 text-center text-xs">
              {rest.slice(0, 2).map((d) => {
                const DayIcon = WEATHER_ICONS[d.icon];
                return (
                  <span key={d.date} className="block">
                    <span className="block text-muted-foreground">{dayLabel(d.date, today)}</span>
                    <DayIcon className="mx-auto my-0.5 h-4 w-4 text-muted-foreground" />
                    <span className="block tabular-nums">{tempText(d.maxTemp)}</span>
                  </span>
                );
              })}
            </span>
          )}
          <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
        {alerts.length > 0 && !open && (
          <span className={cn("mt-2 flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-xs", ALERT_STYLES[alerts[0]!.severity])} data-testid="hof-weather-alert">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-2">
              <span className="font-semibold">DWD – {ALERT_LEVEL_LABELS[alerts[0]!.severity]}, {alertWindow(alerts[0]!.onset, alerts[0]!.expires, today)}:</span> {alerts[0]!.headline}
              {alerts.length > 1 && ` (+${alerts.length - 1} weitere)`}
            </span>
          </span>
        )}
        {data.warnings.length > 0 && !open && (
          <span className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-2">
              {data.warnings[0]!.text}
              {data.warnings.length > 1 && ` (+${data.warnings.length - 1} weitere)`}
            </span>
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-3 border-t px-4 py-3" data-testid="hof-weather-week">
          <ul className="space-y-1.5">
            {data.days.map((d) => {
              const DayIcon = WEATHER_ICONS[d.icon];
              return (
                <li key={d.date} className="grid grid-cols-[4.5rem_1.25rem_2.25rem_1fr_2.25rem] items-center gap-2 text-sm">
                  <span className={cn("truncate", d.date === today && "font-semibold")}>{dayLabel(d.date, today)}</span>
                  <DayIcon className={cn("h-5 w-5", d.icon === "sun" ? "text-amber-500" : "text-sky-600")} />
                  <span className="text-right tabular-nums text-muted-foreground">{tempText(d.minTemp)}</span>
                  {/* Temperature bar: where the day's range sits in the week. */}
                  <span className="relative h-1.5 rounded-full bg-muted">
                    <span
                      className="absolute h-1.5 rounded-full bg-gradient-to-r from-sky-400 to-amber-400"
                      style={{ left: `${((d.minTemp - lo) / span) * 100}%`, width: `${Math.max(6, ((d.maxTemp - d.minTemp) / span) * 100)}%` }}
                    />
                  </span>
                  <span className="tabular-nums font-medium">{tempText(d.maxTemp)}</span>
                  <span className="col-span-5 -mt-1 flex gap-3 pl-[6.25rem] text-[11px] text-muted-foreground">
                    <span>{d.precipitationMm >= 0.5 ? mm(d.precipitationMm) : "trocken"}</span>
                    <span className="flex items-center gap-0.5">
                      <Wind className="h-3 w-3" />
                      Böen {d.maxGustKmh} km/h
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {alerts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Amtliche Warnungen des DWD{data.alertArea ? ` · ${data.alertArea}` : ""}</p>
              {alerts.map((a) => (
                <AlertBox key={a.id} alert={a} today={today} />
              ))}
            </div>
          )}
          {data.warnings.length > 0 && (
            <ul role="alert" className="space-y-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
              {data.warnings.map((w) => (
                <li key={w.kind} className="flex gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {w.text}
                </li>
              ))}
            </ul>
          )}
          <p className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>Deutscher Wetterdienst (über Bright Sky). Hinweise kommen morgens als Push, Unwetterwarnungen des DWD sofort.</span>
            {isAdmin && (
              <button type="button" className="shrink-0 underline" onClick={() => setPlacing(!placing)}>
                Standort ändern
              </button>
            )}
          </p>
          {placing && <LocationForm farm={farm} onDone={() => setPlacing(false)} />}
        </div>
      )}
    </div>
  );
}

const mm = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} l/m²`;

// ── Pflanzenretter ───────────────────────────────────────────────────────────

/** One line with the own place; opens to the top four. */
export function LeaderboardStrip() {
  const { data } = useGetLeaderboard();
  const [open, setOpen] = useState(false);
  if (!data || !data.own) return null;
  const top = data.top.slice(0, 4);
  const ownInTop = top.some((e) => e.isCurrentUser);
  return (
    <div className="rounded-2xl border bg-card" data-testid="hof-leaderboard">
      <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Trophy className="h-4 w-4 shrink-0 text-yellow-500" />
        <span className="flex-1">
          Pflanzenretter: <span className="font-semibold">Platz {data.own.rank}</span>
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Leaf className="h-3.5 w-3.5 text-emerald-600" />
          {data.own.leavesCount}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ol className="border-t px-4 py-2 text-sm">
          {top.map((e) => (
            <li key={e.userId} className={cn("flex items-center gap-3 py-1", e.isCurrentUser && "font-semibold text-emerald-700 dark:text-emerald-400")}>
              <span className="w-5 text-xs tabular-nums text-muted-foreground">{e.rank}.</span>
              <span className="flex-1 truncate font-mono">{e.username}</span>
              <span className="text-xs text-muted-foreground">{e.leavesCount}</span>
            </li>
          ))}
          {!ownInTop && (
            <li className="flex items-center gap-3 border-t border-dashed py-1 font-semibold text-emerald-700 dark:text-emerald-400">
              <span className="w-5 text-xs tabular-nums">{data.own.rank}.</span>
              <span className="flex-1 truncate font-mono">{data.own.username}</span>
              <span className="text-xs">{data.own.leavesCount}</span>
            </li>
          )}
          <li className="pt-1 text-[11px] text-muted-foreground">Blätter gibt es für neu gescannte Arten und abgehakte Pflegetage.</li>
        </ol>
      )}
    </div>
  );
}

// ── Widgets ──────────────────────────────────────────────────────────────────

/** The frame of every widget: small coloured icon, name, one key value, one line. */
function Widget({
  href,
  icon: Icon,
  tone,
  title,
  value,
  line,
  alert,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  title: string;
  /** The key figure, or null while loading. */
  value: ReactNode | null;
  line: ReactNode;
  /** Something needs attention: amber dot. */
  alert?: boolean;
}) {
  return (
    <Link href={href} className="flex min-h-[96px] flex-col gap-1 rounded-2xl border bg-card p-3 transition-all hover:shadow-md active:scale-[0.98]">
      <span className="flex items-center gap-2">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", tone)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="flex-1 truncate text-xs font-semibold text-muted-foreground">{title}</span>
        {alert && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Braucht Aufmerksamkeit" />}
      </span>
      {value === null ? <span className="h-6 w-12 rounded bg-muted animate-pulse" /> : <span className="text-lg font-bold leading-tight">{value}</span>}
      <span className="line-clamp-2 text-xs text-muted-foreground">{line}</span>
    </Link>
  );
}

const TONES = {
  lime: "bg-lime-100 text-lime-800 dark:bg-lime-950/50 dark:text-lime-300",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  rose: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-950/50 dark:text-pink-300",
  red: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  stone: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
} as const;

function PlantTasksWidget() {
  const tasks = useListTasks();
  const active = (tasks.data ?? []).filter((t) => t.isActive);
  const due = active.filter((t) => plantTaskDue(t)).length;
  return (
    <Widget
      href="/aufgaben"
      icon={CalendarCheck}
      tone={TONES.sky}
      title="Pflegeplan"
      value={tasks.data ? (active.length === 0 ? "Keine" : due > 0 ? `${due} fällig` : "Alles erledigt") : null}
      line={active.length === 0 ? "Gießen oder Düngen mit Erinnerung anlegen" : `${active.length} ${active.length === 1 ? "Aufgabe" : "Aufgaben"} im Plan`}
      alert={due > 0}
    />
  );
}

function GardenWidget({ farm }: { farm: FarmSummary }) {
  const today = berlinToday();
  const calendar = useGetGardenCalendar(farm.id, Number(today.slice(0, 4)));
  const soon = (calendar.data ?? []).filter((e) => e.open && e.start <= addDaysIso(today, 7) && e.end >= today).sort((a, b) => a.start.localeCompare(b.start));
  const next = soon[0];
  return (
    <Widget
      href="/beete/kalender"
      icon={Fence}
      tone={TONES.rose}
      title="Beete"
      value={calendar.data ? (soon.length > 0 ? `${soon.length} ${soon.length === 1 ? "Schritt" : "Schritte"}` : "Nichts fällig") : null}
      line={next ? `${next.label} · ${next.bedName}` : "in den nächsten 7 Tagen"}
      alert={soon.some((e) => e.end < addDaysIso(today, 3))}
    />
  );
}

function SeedsWidget({ farm }: { farm: FarmSummary }) {
  const seeds = useGetSeedOverview(farm.id);
  const list = (seeds.data?.seeds ?? []).filter((s) => !s.archived);
  const attention = list.filter((s) => s.status === "check" || s.status === "old" || s.status === "weak");
  return (
    <Widget
      href="/beete/saatgut"
      icon={Leaf}
      tone={TONES.lime}
      title="Saatgut"
      value={seeds.data ? `${list.length} Sorten` : null}
      line={attention.length > 0 ? `${attention.length} prüfen oder bald aufbrauchen` : "Alles keimfähig"}
      alert={attention.length > 0}
    />
  );
}

function GrowWidget() {
  const grow = useGetGrowOverview({ query: { queryKey: ["/api/grow"], retry: false } });
  const plants = (grow.data?.grows ?? []).filter((g) => !g.archived).flatMap((g) => g.plants).filter((p) => p.plan.current !== "done");
  const next = plants
    .map((p) => ({ p, step: p.plan.steps.find((s) => !s.past) }))
    .filter((x) => x.step)
    .sort((a, b) => a.step!.on.localeCompare(b.step!.on))[0];
  return (
    <Widget
      href="/grow"
      icon={Leaf}
      tone={TONES.emerald}
      title="Grow"
      value={grow.isError ? "–" : grow.data ? `${plants.length} ${plants.length === 1 ? "Pflanze" : "Pflanzen"}` : null}
      line={grow.isError ? "Erst Alter bestätigen" : next ? `${deDay(next.step!.on)}: ${next.step!.text}` : "Kein Schritt geplant"}
    />
  );
}

function FarmTasksWidget({ farm }: { farm: FarmSummary }) {
  const tasks = useListFarmTasks(farm.id);
  // The animals' part of the Hof-Aufgaben; the whole list is the bar above.
  const active = (tasks.data ?? []).filter((t) => t.isActive && t.area === "tiere" && !t.isDone);
  const due = active.filter((t) => t.isDue);
  return (
    <Widget
      href="/farm/aufgaben"
      icon={ClipboardList}
      tone={TONES.emerald}
      title="Stall-Aufgaben"
      value={tasks.data ? (active.length === 0 ? "Keine" : due.length > 0 ? `${due.length} fällig` : "Alles erledigt") : null}
      line={due[0] ? `${due[0].title ?? due[0].actionType}${due[0].animalName ? ` · ${due[0].animalName}` : due[0].herdName ? ` · ${due[0].herdName}` : ""}` : active.length === 0 ? "Füttern oder Ausmisten anlegen" : `${active.length} im Plan`}
      alert={due.length > 0}
    />
  );
}

function AnimalsWidget({ farm }: { farm: FarmSummary }) {
  const animals = useListFarmAnimals(farm.id);
  const list = (animals.data ?? []).filter((a) => !a.archivedAt);
  return (
    <Widget
      href="/farm"
      icon={PawPrint}
      tone={TONES.yellow}
      title="Tiere"
      value={animals.data ? `${list.length}` : null}
      line={list.length === 0 ? "Noch keine Tiere angelegt" : topCounts(list.map((a) => a.species), speciesCount)}
    />
  );
}

function DutiesWidget({ farm }: { farm: FarmSummary }) {
  const duties = useGetFarmDuties(farm.id);
  const open = duties.data ? openDuties(duties.data.duties) : 0;
  const overdue = (duties.data?.duties ?? []).some((d) => d.status === "overdue");
  return (
    <Widget
      href="/farm/pflichten"
      icon={ShieldCheck}
      tone={TONES.sky}
      title="Pflichten"
      value={duties.data ? (open > 0 ? `${open} offen` : "Erledigt") : null}
      line={overdue ? "Eine Frist ist überschritten" : open > 0 ? "Meldungen und Fristen" : "Alle Meldungen erledigt"}
      alert={overdue}
    />
  );
}

function FeedWidget({ farm }: { farm: FarmSummary }) {
  const stock = useGetFeedStock(farm.id);
  const low = (stock.data?.stocks ?? []).filter((s) => s.status === "soon" || s.status === "empty");
  const first = low.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))[0];
  return (
    <Widget
      href="/farm/futter/vorrat"
      icon={Wheat}
      tone={TONES.yellow}
      title="Futtervorrat"
      value={stock.isError ? "–" : stock.data ? (low.length > 0 ? `${low.length} knapp` : "Reicht") : null}
      line={first ? `${first.name}${first.daysLeft != null ? ` · noch ${first.daysLeft} Tage` : " · leer"}` : "Kein Futter wird knapp"}
      alert={low.length > 0}
    />
  );
}

function MedicinesWidget({ farm }: { farm: FarmSummary }) {
  const medicines = useListMedicines(farm.id);
  const list = (medicines.data ?? []).filter((m) => !m.archived);
  const expired = list.filter((m) => m.status === "expired");
  const soon = list.filter((m) => m.status === "expiresSoon");
  return (
    <Widget
      href="/farm/arzneimittel"
      icon={Pill}
      tone={TONES.red}
      title="Arzneimittel"
      value={medicines.isError ? "–" : medicines.data ? `${list.length} im Vorrat` : null}
      line={expired.length > 0 ? `${expired.length} abgelaufen` : soon.length > 0 ? `${soon.length} laufen bald ab` : "Alles haltbar"}
      alert={expired.length + soon.length > 0}
    />
  );
}

function BreedingWidget({ farm }: { farm: FarmSummary }) {
  const breeding = useListBreeding(farm.id);
  const running = (breeding.data ?? []).filter((b) => b.status === "running").sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const next = running[0];
  return (
    <Widget
      href="/farm/zucht"
      icon={Baby}
      tone={TONES.pink}
      title="Zucht"
      value={breeding.isError ? "–" : breeding.data ? (running.length > 0 ? `${running.length} laufend` : "Keine") : null}
      line={next ? `${next.motherName ?? "Tier"}: erwartet ${deDay(next.dueOn)}` : "Keine Trächtigkeit oder Brut"}
      alert={running.some((b) => b.late)}
    />
  );
}

function YieldsWidget({ farm }: { farm: FarmSummary }) {
  const year = Number(berlinToday().slice(0, 4));
  const yields = useGetYieldOverview(farm.id, year);
  return (
    <Widget
      href="/farm/ertrag"
      icon={PiggyBank}
      tone={TONES.emerald}
      title={`Ertrag ${year}`}
      value={yields.isError ? "–" : yields.data ? euro(yields.data.balance) : null}
      line="Bilanz: Eigenversorgung + Verkauf − Ausgaben"
    />
  );
}

function addDaysIso(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Which component draws which widget. */
const RENDER: Record<WidgetId, (farm: FarmSummary) => ReactNode> = {
  "plant-tasks": () => <PlantTasksWidget />,
  garden: (farm) => <GardenWidget farm={farm} />,
  seeds: (farm) => <SeedsWidget farm={farm} />,
  grow: () => (GROW_ENABLED ? <GrowWidget /> : null),
  "farm-tasks": (farm) => <FarmTasksWidget farm={farm} />,
  animals: (farm) => <AnimalsWidget farm={farm} />,
  duties: (farm) => <DutiesWidget farm={farm} />,
  feed: (farm) => <FeedWidget farm={farm} />,
  medicines: (farm) => <MedicinesWidget farm={farm} />,
  breeding: (farm) => <BreedingWidget farm={farm} />,
  yields: (farm) => <YieldsWidget farm={farm} />,
};

const AREA_LABELS: Record<WidgetArea, { label: string; href: string }> = {
  pflanzen: { label: "Pflanzen", href: "/pflanzen" },
  tiere: { label: "Tiere", href: "/farm" },
};

function Area({ area, farm, layout }: { area: WidgetArea; farm: FarmSummary; layout: readonly WidgetId[] }) {
  const widgets = widgetsOf(layout, area);
  if (widgets.length === 0) return null;
  return (
    <section className="space-y-2" data-testid={`hof-${area}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{AREA_LABELS[area].label}</h2>
        <Link href={AREA_LABELS[area].href} className="text-xs text-primary">
          Alle ansehen
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {widgets.map((w) => (
          <div key={w.id} className="contents">
            {RENDER[w.id](farm)}
          </div>
        ))}
      </div>
    </section>
  );
}

/** The Hof overview: which Hof (own or shared), weather, Pflanzenretter, the two tools, then the widgets of Pflanzen and Tiere. */
export function HofDashboard() {
  const { farm, farms, select } = useActiveFarm();
  const saved = useGetDashboard();
  const modules = useModules();
  // Widgets this build offers (Grow only where the module is in) of modules the account uses.
  const available = (id: WidgetId) => (id !== "grow" || GROW_ENABLED) && modules.visible(WIDGET_MODULE[id]) && farmModuleGranted(farm, WIDGET_MODULE[id]);
  const [editing, setEditing] = useState(false);
  // The account's own choice, else the default (docs/dashboard.md).
  const layout = effectiveLayout(saved.data?.widgets, available);
  return (
    <div className="w-full space-y-4">
      <TesterNotice closable />
      <FarmSwitcher farms={farms} active={farm} onSelect={select} />
      {farm ? <WeatherStrip farm={farm} /> : <div className="h-[72px] rounded-2xl border bg-card animate-pulse" />}
      <LeaderboardStrip />
      <HofTools farm={farm} />
      {farm && !saved.isLoading && (
        <>
          <Area area="pflanzen" farm={farm} layout={layout} />
          <Area area="tiere" farm={farm} layout={layout} />
          {layout.length === 0 && <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Du hast alle Widgets ausgeblendet.</p>}
          <button type="button" className="mx-auto flex items-center gap-1.5 text-sm text-primary" onClick={() => setEditing(true)}>
            <SlidersHorizontal className="h-4 w-4" />
            Dashboard anpassen
          </button>
        </>
      )}
      {editing && <DashboardEditor layout={layout} available={available} onClose={() => setEditing(false)} />}
    </div>
  );
}
