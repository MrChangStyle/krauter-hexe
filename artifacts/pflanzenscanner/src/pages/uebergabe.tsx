import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, Check, ClipboardList, Handshake, HeartPulse, Loader2, Phone, StickyNote } from "lucide-react";
import {
  getGetHandoverQueryKey,
  getListFarmTasksQueryKey,
  useCompleteFarmTask,
  useEnsureOwnFarm,
  useGetHandover,
  useListFarmTasks,
  useSetHandoverNote,
  type FarmSummary,
} from "@workspace/api-client-react";
import { FarmContactsCard } from "@/components/farm-contacts-card";
import { FarmWeatherCard } from "@/components/farm-weather-card";
import { HousingOrderBanner } from "@/components/housing-order-banner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { deDay } from "@/lib/medicine-labels";
import { PageHeader } from "@/components/page-header";

function Section({ icon: Icon, title, children }: { icon: typeof Handshake; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
      <h2 className="flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Note({ farm, note }: { farm: FarmSummary; note: string | null }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note ?? "");
  const save = useSetHandoverNote({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getGetHandoverQueryKey(farm.id), data);
        setEditing(false);
        toast({ title: "Übergabe-Notiz gespeichert" });
      },
      onError: () => toast({ title: "Nicht gespeichert", variant: "destructive" }),
    },
  });
  const isAdmin = farm.role === "admin";

  return (
    <Section icon={StickyNote} title="Gut zu wissen">
      {editing ? (
        <div className="space-y-2">
          <Textarea
            aria-label="Übergabe-Notiz"
            rows={6}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"z. B. Schlüssel liegt im Schuppen links.\nTierärztin Dr. Klee: 0123 456 789\nHühner abends um 19 Uhr einsperren (Fuchs!)."}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ farmId: farm.id, data: { note: text.trim() || null } })}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Speichern
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <>
          {note ? <p className="whitespace-pre-wrap">{note}</p> : <p className="text-muted-foreground">{isAdmin ? "Noch keine Notiz. Schreib auf, was eine Vertretung wissen muss: Schlüssel, Tierarzt, Besonderheiten." : "Noch keine Notiz."}</p>}
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {note ? "Notiz ändern" : "Notiz schreiben"}
            </Button>
          )}
        </>
      )}
    </Section>
  );
}

function Handover({ farm }: { farm: FarmSummary }) {
  const queryClient = useQueryClient();
  const handover = useGetHandover(farm.id);
  const tasks = useListFarmTasks(farm.id);
  const complete = useCompleteFarmTask({
    mutation: { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListFarmTasksQueryKey(farm.id) }) },
  });
  if (!handover.data) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  const h = handover.data;
  const due = (tasks.data ?? []).filter((t) => t.isActive && t.isDue).sort((a, b) => a.reminderTime.localeCompare(b.reminderTime));
  const canWrite = farm.role !== "guest";

  return (
    <div className="space-y-4">
      {h.accessUntil && (
        <p className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          Du vertrittst bis {deDay(h.accessUntil)}. Danach endet dein Zugang zu „{farm.name}“ von selbst.
        </p>
      )}

      <HousingOrderBanner farm={farm} />

      <Note key={h.note ?? ""} farm={farm} note={h.note} />

      <Section icon={ClipboardList} title="Heute zu tun">
        {tasks.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : due.length === 0 ? (
          <p className="text-muted-foreground">Alles erledigt – oder es sind keine Stall-Aufgaben angelegt.</p>
        ) : (
          <ul className="space-y-2">
            {due.map((t) => (
              <li key={t.id} className="flex items-start gap-3 rounded-lg border border-border p-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {t.reminderTime} · {t.title ?? t.actionType} – {t.animalName ?? t.herdName ?? "ganzer Hof"}
                  </span>
                  {t.notes && <span className="block text-xs text-muted-foreground">{t.notes}</span>}
                </span>
                {canWrite && (
                  <Button size="sm" variant="outline" className="gap-1" disabled={complete.isPending} onClick={() => complete.mutate({ farmId: farm.id, taskId: t.id })}>
                    <Check className="h-4 w-4" />
                    Erledigt
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {h.withdrawals.length > 0 && (
        <section role="alert" className="space-y-1.5 rounded-2xl border-2 border-red-600 bg-red-50 p-4 text-sm text-red-950 dark:bg-red-950/40 dark:text-red-100">
          <h2 className="flex items-center gap-2 font-semibold">
            <AlertOctagon className="h-4 w-4" />
            Wartezeit läuft – Eier, Milch und Fleisch nicht verwenden
          </h2>
          <ul className="space-y-0.5">
            {h.withdrawals.map((w, k) => (
              <li key={k}>
                {w.animalName}: bis {deDay(w.until)}
                {w.medication && ` (${w.medication})`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <FarmWeatherCard farm={farm} />

      <Section icon={HeartPulse} title="Behandlungen der letzten zwei Wochen">
        {h.recentHealth.length === 0 ? (
          <p className="text-muted-foreground">Keine.</p>
        ) : (
          <ul className="space-y-1.5">
            {h.recentHealth.map((r, k) => (
              <li key={k}>
                <span className="font-medium">{r.animalName}</span> · {deDay(r.date)} · {r.diagnosis}
                {(r.treatment || r.medication) && <span className="block text-xs text-muted-foreground">{[r.treatment, r.medication].filter(Boolean).join(" · ")}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={Phone} title="Bei Fragen">
        <p>{h.contacts.map((c) => c.displayName).join(", ")} (Admin)</p>
      </Section>

      <FarmContactsCard farm={farm} compact />
    </div>
  );
}

/** /farm/uebergabe – what a stand-in needs to know, and today's stall tasks. */
export default function UebergabePage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="uebergabe" subtitle={<>Für alle, die die Tiere ein paar Tage versorgen. Eine Vertretung trägt ein Admin unter{" "} <Link href="/team" className="font-medium text-foreground underline underline-offset-4"> Farm &amp; Team </Link>{" "} ein – mit dem Datum „Vertretung bis“ endet der Zugang danach von selbst.</>} />
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Handover farm={farm} />}
    </div>
  );
}
