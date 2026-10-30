import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useEnsureOwnFarm, useGetGardenCalendar, type FarmSummary, type GardenEventKind } from "@workspace/api-client-react";
import { EventChip, useToggleGardenEvent } from "@/components/bed-calendar";
import { FrostWarnings } from "@/components/garden-overview";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { KIND_COLORS, KIND_LABELS, MONTHS, inMonth, todayKey } from "@/lib/garden-calendar";
import { PageHeader } from "@/components/page-header";

const KINDS: GardenEventKind[] = ["sow_indoor", "direct_sow", "plant_out", "harvest"];

function MonthView({ farm }: { farm: FarmSummary }) {
  const today = todayKey();
  const [month, setMonth] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
  const calendar = useGetGardenCalendar(farm.id, month.year);
  const { toggle, pending } = useToggleGardenEvent(farm.id, month.year);
  const canWrite = farm.role !== "guest";
  const entries = (calendar.data ?? []).filter((e) => inMonth(e, month.year, month.month));
  const step = (d: number) => {
    const m = month.month + d;
    setMonth({ year: month.year + (m > 12 ? 1 : m < 1 ? -1 : 0), month: ((m + 11) % 12) + 1 });
  };

  return (
    <div className="space-y-4">
      <FrostWarnings farmId={farm.id} />
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-2 py-1.5">
        <button type="button" aria-label="Vormonat" className="rounded-full p-2 hover:bg-muted" onClick={() => step(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-semibold">
          {MONTHS[month.month - 1]} {month.year}
        </span>
        <button type="button" aria-label="Folgemonat" className="rounded-full p-2 hover:bg-muted" onClick={() => step(1)}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {calendar.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (calendar.data ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Für {month.year} ist noch nichts gepflanzt. Setz Pflanzen in ein Beet – die Termine erscheinen dann hier.
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">In diesem Monat steht nichts an.</p>
      ) : (
        KINDS.map((kind) => {
          const list = entries.filter((e) => e.kind === kind);
          if (list.length === 0) return null;
          return (
            <section key={kind} className="space-y-2">
              <h2 className="flex items-center gap-2 font-semibold">
                <span className="h-3 w-3 rounded-sm" style={{ background: KIND_COLORS[kind] }} />
                {KIND_LABELS[kind]}
              </h2>
              <ul className="space-y-1.5">
                {list.map((e) => (
                  <li key={`${e.plantingId}-${e.kind}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <EventChip entry={e} canWrite={canWrite} busy={pending} onToggle={() => toggle(e)} showLabel />
                    <Link href={`/beete/${farm.id}/${e.bedId}`} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                      {e.bedName}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
      <p className="text-xs text-muted-foreground">
        Die Termine richten sich nach den Frostterminen jedes Beetes. Jeden Morgen schickt dir die App eine Erinnerung, wenn ein Termin beginnt oder Frost droht.
      </p>
    </div>
  );
}

/** /beete/kalender – Gartenkalender: what is due in the beds, month by month. */
export default function GartenKalenderPage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="garten-kalender" />
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <MonthView farm={farm} />}
    </div>
  );
}
