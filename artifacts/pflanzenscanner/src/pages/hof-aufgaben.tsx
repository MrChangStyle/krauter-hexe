import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Leaf, Loader2, Plus, Repeat, Sprout, Users, X } from "lucide-react";
import {
  getListFarmTasksQueryKey,
  getListTasksQueryKey,
  useCompleteTask,
  useCreateFarmTask,
  useListFarmTasks,
  useListPlants,
  useListTasks,
  type FarmSummary,
  type FarmTask,
} from "@workspace/api-client-react";
import { HofTaskDialog, HofTaskRow, errorText, useTeam } from "@/components/hof-tasks";
import { GardenTodoSection } from "@/components/garden-overview";
import { DictateButton } from "@/components/dictate-button";
import { Button } from "@/components/ui/button";
import { useActiveFarm } from "@/hooks/use-active-farm";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/farm-labels";
import { farmModuleGranted } from "@/lib/modules";
import { AREA_LABELS, hofToday, splitTaskList, type HofFilter } from "@/lib/hof-tasks";

/**
 * /hof-aufgaben – the shared list of the Hof (docs/hof-aufgaben.md): what is
 * to be done today, for everyone on the team, with ticking off and comments.
 * New tasks by typing or speaking, several at once.
 */
export default function HofAufgabenPage() {
  const { farm, failed } = useActiveFarm();
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Hof
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Hof-Aufgaben</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
          {farm ? ` · ${farm.name}` : ""}
        </p>
      </div>
      {!farm ? (
        failed ? <p className="text-sm text-muted-foreground">Der Hof konnte nicht geladen werden. Bist du online?</p> : <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : !farmModuleGranted(farm, "farm-tasks") ? (
        <p className="text-sm text-muted-foreground">Die Hof-Aufgaben sind für dich auf diesem Hof nicht freigegeben. Frag einen Admin.</p>
      ) : (
        <HofTasks farm={farm} />
      )}
    </div>
  );
}

const FILTERS: Array<{ id: HofFilter; label: string }> = [
  { id: "all", label: "Alle" },
  { id: "mine", label: "Für mich" },
  { id: "tiere", label: AREA_LABELS.tiere },
  { id: "garten", label: AREA_LABELS.garten },
  { id: "hof", label: AREA_LABELS.hof },
];

function HofTasks({ farm }: { farm: FarmSummary }) {
  const tasks = useListFarmTasks(farm.id);
  const team = useTeam(farm);
  const me = team.find((m) => m.isMe)?.userId ?? null;
  const canWrite = farm.role !== "guest";
  const [filter, setFilter] = useState<HofFilter>("all");
  const [dialog, setDialog] = useState<{ task: FarmTask | null; key: number } | null>(null);
  const today = todayIso();
  const { open, done, soon } = hofToday(tasks.data ?? [], today, filter, me);
  const edit = (task: FarmTask) => setDialog({ task, key: Date.now() });
  const rows = (list: FarmTask[]) => (
    <ul className="space-y-2">
      {list.map((t) => (
        <HofTaskRow key={t.id} farmId={farm.id} task={t} canWrite={canWrite} today={today} onEdit={edit} />
      ))}
    </ul>
  );

  return (
    <div className="space-y-5">
      {canWrite && <QuickAdd farm={farm} team={team} onMore={() => setDialog({ task: null, key: Date.now() })} />}

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Filter">
        {FILTERS.filter((f) => f.id !== "mine" || team.length > 1).map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-sm",
              filter === f.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {tasks.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <section className="space-y-2" aria-labelledby="hof-open">
            <h2 id="hof-open" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Heute zu tun {open.length > 0 && `(${open.length})`}
            </h2>
            {open.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                {done.length > 0 ? "Alles erledigt – danke!" : canWrite ? "Für heute steht nichts an. Oben eine Aufgabe eintippen oder sprechen." : "Für heute steht nichts an."}
              </p>
            ) : (
              rows(open)
            )}
          </section>
          {done.length > 0 && (
            <section className="space-y-2" aria-labelledby="hof-done">
              <h2 id="hof-done" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Heute erledigt ({done.length})</h2>
              {rows(done)}
            </section>
          )}
          {soon.length > 0 && (
            <section className="space-y-2" aria-labelledby="hof-soon">
              <h2 id="hof-soon" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">In den nächsten Tagen</h2>
              {rows(soon)}
            </section>
          )}
          <AllTasks tasks={tasks.data ?? []} onEdit={canWrite ? edit : undefined} />
        </>
      )}

      {(filter === "all" || filter === "garten" || filter === "mine") && <PlantCareToday />}
      {(filter === "all" || filter === "garten") && <GardenTodoSection />}
      <TeamCard farm={farm} count={team.length} />

      {dialog && <HofTaskDialog key={dialog.key} farm={farm} task={dialog.task} team={team} onClose={() => setDialog(null)} />}
    </div>
  );
}

/**
 * Type or speak one task – or a whole list ("Eier einsammeln. Gänse füttern.
 * Teichpumpe kontrollieren."): several become a preview to check first.
 */
function QuickAdd({ farm, team, onMore }: { farm: FarmSummary; team: ReturnType<typeof useTeam>; onMore: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("");
  const [daily, setDaily] = useState(false);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const create = useCreateFarmTask();

  async function save(titles: string[]) {
    setSaving(true);
    let saved = 0;
    try {
      for (const title of titles) {
        await create.mutateAsync({
          farmId: farm.id,
          data: { title, assigneeId: assignee || null, startsOn: todayIso(), repeats: daily, intervalValue: 1, intervalUnit: "Tage", reminderTime: "08:00" },
        });
        saved++;
      }
      setText("");
      setPreview(null);
      toast({ title: saved === 1 ? "Aufgabe angelegt" : `${saved} Aufgaben angelegt`, description: daily ? "Jeden Tag, ab heute." : "Für heute." });
    } catch (err) {
      toast({ title: errorText(err, "Nicht gespeichert"), description: saved > 0 ? `${saved} von ${titles.length} sind angelegt.` : undefined, variant: "destructive" });
      if (saved > 0) setPreview(titles.slice(saved));
    } finally {
      setSaving(false);
      void queryClient.invalidateQueries({ queryKey: getListFarmTasksQueryKey(farm.id) });
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const titles = splitTaskList(text);
    if (titles.length === 0) return;
    if (titles.length === 1) void save(titles);
    else setPreview(titles);
  }

  return (
    <section className="space-y-2 rounded-2xl border bg-card p-3" aria-label="Neue Aufgabe">
      <form onSubmit={submit} className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="hof-quick" className="text-sm font-medium">Neue Aufgabe</label>
          <DictateButton value={text} onChange={(t) => { setText(t); setPreview(null); }} max={1500} label="Aufgaben sprechen" />
        </div>
        <textarea
          id="hof-quick"
          rows={text.length > 60 || text.includes("\n") ? 3 : 1}
          maxLength={1500}
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="z. B. Eier einsammeln, Gänse füttern"
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-2">
          {team.length > 1 && (
            <select aria-label="Für wen?" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Für alle</option>
              {team.map((m) => (
                <option key={m.userId} value={m.userId}>Für {m.isMe ? "mich" : m.displayName}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            aria-pressed={daily}
            onClick={() => setDaily(!daily)}
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm", daily ? "border-primary bg-primary/10 text-primary" : "border-input")}
          >
            <Repeat className="h-4 w-4" />
            Täglich
          </button>
          <Button type="submit" size="sm" className="ml-auto h-9 gap-1.5" disabled={saving || !text.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Hinzufügen
          </Button>
        </div>
      </form>
      {preview && (
        <div className="space-y-2 rounded-xl bg-muted/60 p-2.5" data-testid="hof-preview">
          <p className="text-sm font-medium">{preview.length} Aufgaben erkannt:</p>
          <ul className="space-y-1">
            {preview.map((t, i) => (
              <li key={`${t}-${i}`} className="flex items-center gap-2 rounded-lg bg-background px-2.5 py-1.5 text-sm">
                <span className="flex-1">{t}</span>
                <button type="button" aria-label={`${t} entfernen`} className="p-1 text-muted-foreground" onClick={() => setPreview(preview.filter((_, j) => j !== i))}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setPreview(null)} disabled={saving}>Ändern</Button>
            <Button type="button" size="sm" className="gap-1.5" onClick={() => void save(preview)} disabled={saving || preview.length === 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Alle anlegen
            </Button>
          </div>
        </div>
      )}
      <button type="button" onClick={onMore} className="text-xs text-primary underline-offset-2 hover:underline">
        Mit Tag, Wiederholung, Uhrzeit oder Tier anlegen …
      </button>
    </section>
  );
}

/** Every task of the Hof, also later and paused ones – to change or delete. */
function AllTasks({ tasks, onEdit }: { tasks: FarmTask[]; onEdit?: (t: FarmTask) => void }) {
  const [open, setOpen] = useState(false);
  const list = tasks.filter((t) => !t.isDone);
  if (list.length === 0 || !onEdit) return null;
  return (
    <section>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="text-sm text-primary">
        {open ? "Alle Aufgaben ausblenden" : `Alle Aufgaben verwalten (${list.length})`}
      </button>
      {open && (
        <ul className="mt-2 divide-y rounded-2xl border bg-card">
          {list.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => onEdit(t)} className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm", !t.isActive && "opacity-60")}>
                <span className="flex-1 truncate">{t.title ?? t.actionType}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{t.isActive ? AREA_LABELS[t.area] : "pausiert"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The own plant care that is due (Pflegeplan) – personal, so only for oneself. */
function PlantCareToday() {
  const queryClient = useQueryClient();
  const tasks = useListTasks();
  const plants = useListPlants(undefined, { query: { queryKey: ["/api/plants"] } });
  const complete = useCompleteTask({ mutation: { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) } });
  const today = todayIso();
  const due = (tasks.data ?? []).filter((t) => t.isActive && t.nextDueDate <= today);
  if (due.length === 0) return null;
  const name = (id: number) => (plants.data ?? []).find((p) => p.id === id)?.germanName ?? "Pflanze";
  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4" aria-labelledby="hof-plants">
      <div className="flex items-center justify-between gap-2">
        <h2 id="hof-plants" className="flex items-center gap-2 font-semibold">
          <Leaf className="h-4 w-4 text-emerald-600" />
          Pflanzenpflege
        </h2>
        <Link href="/aufgaben" className="text-sm text-primary">Pflegeplan</Link>
      </div>
      <p className="text-xs text-muted-foreground">Deine eigenen Pflanzen – nur du siehst sie.</p>
      <ul className="space-y-1.5">
        {due.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm">
            <Sprout className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="min-w-0 flex-1 truncate">
              {t.actionType} · {name(t.plantId)}
            </span>
            <Button size="sm" variant="outline" className="h-8 gap-1" disabled={complete.isPending} onClick={() => complete.mutate({ id: t.id })}>
              <Check className="h-4 w-4" />
              Erledigt
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Sharing the list: who is on the team, and the way to add someone. */
function TeamCard({ farm, count }: { farm: FarmSummary; count: number }) {
  if (farm.role !== "admin") return null;
  return (
    <Link href="/team" className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm">
      <Users className="h-5 w-5 shrink-0 text-primary" />
      <span className="flex-1">
        <span className="block font-medium">{count > 1 ? `Geteilt mit ${count - 1} ${count === 2 ? "Person" : "Personen"}` : "Liste teilen"}</span>
        <span className="block text-xs text-muted-foreground">
          {count > 1 ? "Weitere Teammitglieder unter Farm & Team hinzufügen." : "Füg jemanden mit eigenem Konto zum Team hinzu – dann sieht er die Liste und kann abhaken."}
        </span>
      </span>
    </Link>
  );
}
