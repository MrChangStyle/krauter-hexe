import { Link } from "wouter";
import { CalendarDays, Snowflake } from "lucide-react";
import {
  getGetFrostWarningsQueryKey,
  useGetFrostWarnings,
  useGetGardenCalendar,
  useListMyFarms,
  type FarmSummary,
} from "@workspace/api-client-react";
import { EventChip, useToggleGardenEvent } from "@/components/bed-calendar";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { todayKey, upcoming } from "@/lib/garden-calendar";

const temp = (t: number) => `${String(t).replace(".", ",").replace("-", "−")} °C`;

/** Frost warning for the coming night (DWD forecast), one line per bed. */
export function FrostWarnings({ farmId }: { farmId: number }) {
  const warnings = useGetFrostWarnings(farmId, { query: { queryKey: getGetFrostWarningsQueryKey(farmId), staleTime: 30 * 60 * 1000 } });
  const list = warnings.data ?? [];
  if (list.length === 0) return null;
  return (
    <div role="alert" className="space-y-1.5 rounded-2xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
      <p className="flex items-center gap-1.5 font-semibold">
        <Snowflake className="h-4 w-4" />
        Frostwarnung für heute Nacht
      </p>
      {list.map((w) => (
        <p key={w.bedId}>
          {w.minTemp <= 0 ? `Frost bis ${temp(w.minTemp)}` : `Bodenfrost möglich (${temp(w.minTemp)})`} am Beet „{w.bedName}“:{" "}
          {w.plants.join(", ")} abdecken oder reinholen.
        </p>
      ))}
      <p className="text-xs opacity-75">Vorhersage: Deutscher Wetterdienst</p>
    </div>
  );
}

function GardenTodo({ farm }: { farm: FarmSummary }) {
  const today = todayKey();
  const season = Number(today.slice(0, 4));
  const calendar = useGetGardenCalendar(farm.id, season);
  const { toggle, pending } = useToggleGardenEvent(farm.id, season);
  const canWrite = farm.role !== "guest";
  const { now, soon } = upcoming(calendar.data ?? [], today);
  const hasPlan = (calendar.data ?? []).length > 0;
  if (!hasPlan) return null;

  const group = (title: string, list: typeof now) =>
    list.length > 0 && (
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <ul className="space-y-1.5">
          {list.map((e) => (
            <li key={`${e.plantingId}-${e.kind}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <EventChip entry={e} canWrite={canWrite} busy={pending} onToggle={() => toggle(e)} showLabel />
              <span className="text-xs text-muted-foreground">{e.bedName}</span>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Im Garten</h2>
        <Link href="/beete/kalender" className="inline-flex items-center gap-1 text-sm text-primary">
          <CalendarDays className="h-4 w-4" />
          Gartenkalender
        </Link>
      </div>
      <FrostWarnings farmId={farm.id} />
      {group("Jetzt dran", now)}
      {group("In den nächsten zwei Wochen", soon)}
      {now.length === 0 && soon.length === 0 && <p className="text-sm text-muted-foreground">Gerade steht im Garten nichts an.</p>}
    </section>
  );
}

/** Pflegeplan: the garden dates of the active farm (nothing without beds). */
export function GardenTodoSection() {
  const farms = useListMyFarms();
  const farm = farms.data ? pickActiveFarm(farms.data, readActiveFarmId()) : null;
  return farm ? <GardenTodo farm={farm} /> : null;
}
