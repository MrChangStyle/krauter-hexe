import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import {
  getGetGardenCalendarQueryKey,
  useCheckGardenEvent,
  useGetGardenCalendar,
  useUncheckGardenEvent,
  type BedPlanting,
  type Crop,
  type GardenCalendarEntry,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { KIND_COLORS, KIND_DONE, KIND_LABELS, MONTHS, dayRange, todayKey, yearSpan } from "@/lib/garden-calendar";

/** Tick a date off (or undo it) – shared by the bed, the month view and the care plan. */
export function useToggleGardenEvent(farmId: number, season: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const options = {
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetGardenCalendarQueryKey(farmId, season) }),
      onError: () => toast({ title: "Nicht gespeichert", description: "Bitte versuche es noch einmal.", variant: "destructive" as const }),
    },
  };
  const check = useCheckGardenEvent(options);
  const uncheck = useUncheckGardenEvent(options);
  return {
    pending: check.isPending || uncheck.isPending,
    toggle(entry: GardenCalendarEntry) {
      const vars = { farmId, plantingId: entry.plantingId, kind: entry.kind };
      if (entry.done) uncheck.mutate(vars);
      else check.mutate(vars);
    },
  };
}

/** One date as a tappable chip: ticked off, still to do, or no longer needed. */
export function EventChip({ entry, canWrite, busy, onToggle, showLabel = false }: {
  entry: GardenCalendarEntry;
  canWrite: boolean;
  busy: boolean;
  onToggle: () => void;
  showLabel?: boolean;
}) {
  const text = `${showLabel ? `${entry.label} ` : ""}${entry.done ? KIND_DONE[entry.kind] : KIND_LABELS[entry.kind]}`;
  return (
    <button
      type="button"
      disabled={!canWrite || busy}
      onClick={onToggle}
      aria-pressed={entry.done}
      aria-label={`${entry.label}: ${KIND_LABELS[entry.kind]} ${dayRange(entry.start, entry.end)}${entry.done ? ", erledigt" : ""}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-default",
        entry.done ? "border-transparent bg-primary/10 text-primary" : "border-border bg-card enabled:hover:bg-muted",
        !entry.open && !entry.done && "opacity-50",
      )}
    >
      <span
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full"
        style={{ background: entry.done ? "transparent" : KIND_COLORS[entry.kind] }}
      >
        {entry.done && <Check className="h-3.5 w-3.5" />}
      </span>
      <span className="font-medium">{text}</span>
      <span className="text-muted-foreground">{dayRange(entry.start, entry.end)}</span>
    </button>
  );
}

/** Kalender of one bed for a season: a year bar per planting and its dates. */
export function BedCalendar({ farmId, bedId, season, canWrite, plantings, crops }: {
  farmId: number;
  bedId: number;
  season: number;
  canWrite: boolean;
  plantings: BedPlanting[];
  crops: Map<string, Crop>;
}) {
  const calendar = useGetGardenCalendar(farmId, season);
  const { toggle, pending } = useToggleGardenEvent(farmId, season);
  const shown = new Set(plantings.map((p) => p.id));
  const entries = (calendar.data ?? []).filter((e) => e.bedId === bedId && shown.has(e.plantingId));
  const rows = plantings.filter((p) => entries.some((e) => e.plantingId === p.id));
  const today = todayKey();
  const todayPos = today.startsWith(String(season)) ? yearSpan(today, today, season)?.left : undefined;
  const noData = plantings.filter((p) => !p.cropKey).map((p) => p.label);

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Kalender {season}</h2>
      {calendar.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {plantings.length === 0 ? "Sobald etwas im Beet steht, erscheinen hier Saat-, Pflanz- und Erntetermine." : "Für diese Pflanzen gibt es noch keine Anbaudaten."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {(["sow_indoor", "direct_sow", "plant_out", "harvest"] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: KIND_COLORS[k] }} />
                {KIND_LABELS[k]}
              </span>
            ))}
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="ml-[5.5rem] grid grid-cols-12 text-center text-[10px] text-muted-foreground">
              {MONTHS.map((m) => (
                <span key={m}>{m[0]}</span>
              ))}
            </div>
            <ul className="mt-1 space-y-1.5">
              {rows.map((p) => {
                const mine = entries.filter((e) => e.plantingId === p.id);
                return (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="flex w-20 shrink-0 items-center gap-1.5 truncate text-xs font-medium">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: (p.cropKey && crops.get(p.cropKey)?.color) || "#7DBB6A" }} />
                      <span className="truncate">{p.label}</span>
                    </span>
                    <span className="relative h-4 flex-1 rounded bg-muted">
                      {mine.map((e) => {
                        const span = yearSpan(e.start, e.end, season);
                        if (!span) return null;
                        return (
                          <span
                            key={e.kind}
                            title={`${KIND_LABELS[e.kind]} ${dayRange(e.start, e.end)}`}
                            className={cn("absolute top-0.5 h-3 rounded-sm", !e.open && !e.done && "opacity-30")}
                            style={{ left: `${span.left * 100}%`, width: `${Math.max(span.width * 100, 1)}%`, background: KIND_COLORS[e.kind] }}
                          />
                        );
                      })}
                      {todayPos !== undefined && <span className="absolute -top-0.5 bottom-[-2px] w-px bg-foreground/60" style={{ left: `${todayPos * 100}%` }} />}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <ul className="space-y-2">
            {rows.map((p) => (
              <li key={p.id} className="space-y-1">
                <p className="text-sm font-medium">{p.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {entries
                    .filter((e) => e.plantingId === p.id)
                    .map((e) => (
                      <EventChip key={e.kind} entry={e} canWrite={canWrite} busy={pending} onToggle={() => toggle(e)} />
                    ))}
                </div>
              </li>
            ))}
          </ul>
          {canWrite && <p className="text-xs text-muted-foreground">Termin antippen, wenn er erledigt ist – dann erinnert dich die App nicht mehr daran.</p>}
        </>
      )}
      {noData.length > 0 && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">Ohne Anbaudaten keine Termine: {noData.join(", ")}.</p>
      )}
    </section>
  );
}
