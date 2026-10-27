import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Leaf, Loader2, NotebookPen, Plus, Repeat, Sparkles, Sprout, Users, X } from "lucide-react";
import {
  getListFarmTasksQueryKey,
  getListTasksQueryKey,
  useCompleteTask,
  useCreateFarmTask,
  useListFarmTasks,
  useListPlants,
  useListTasks,
  usePlanFarmTasks,
  type FarmSummary,
  type FarmTask,
} from "@workspace/api-client-react";
import { HofTaskDialog, HofTaskRow, errorText, useTeam } from "@/components/hof-tasks";
import { GardenTodoSection } from "@/components/garden-overview";
import { ShareListsDialog } from "@/components/share-lists-dialog";
import { FarmSwitcher } from "@/components/farm-switcher";
import { DictateButton } from "@/components/dictate-button";
import { SpeakHint } from "@/components/speak-hint";
import { MAX_SAID, TOOL_FRAME, TOOL_SAVE, ToolActions, ToolCardHeader } from "@/components/tool-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveFarm } from "@/hooks/use-active-farm";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/farm-labels";
import { farmModuleGranted } from "@/lib/modules";
import { AREA_LABELS, dayLabel, hofToday, needsPlan, planLocally, splitTaskList, type HofFilter, type Planned } from "@/lib/hof-tasks";

/**
 * /hof-aufgaben – the shared list of the Hof (docs/hof-aufgaben.md): what is
 * to be done today, for everyone on the team, with ticking off and comments.
 * New tasks by typing or speaking, several at once.
 */
export default function HofAufgabenPage() {
  const { farm, farms, failed, select } = useActiveFarm();
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
      {/* The list of which Hof – the own one or one shared with me. */}
      <FarmSwitcher farms={farms} active={farm} onSelect={select} />
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
      <TeamCard farm={farm} team={team} />

      {dialog && <HofTaskDialog key={dialog.key} farm={farm} task={dialog.task} team={team} onClose={() => setDialog(null)} />}
    </div>
  );
}

/**
 * Speak or type freely ("Heute müssen die Eier eingesammelt werden, die Gänse
 * jeden Tag gefüttert, und morgen die Blumen gegossen") – the KI-Aufgabenplan
 * makes single tasks with day, repetition, time and person. A plain single
 * task goes straight to the list. Without the AI (offline, daily limit) the
 * app reads simple words itself. Everything is shown to check first.
 */
function QuickAdd({ farm, team, onMore }: { farm: FarmSummary; team: ReturnType<typeof useTeam>; onMore: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("");
  const [daily, setDaily] = useState(false);
  const [preview, setPreview] = useState<{ tasks: Planned[]; byAi: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const create = useCreateFarmTask();
  const plan = usePlanFarmTasks();
  const today = todayIso();
  const defaults = { assigneeId: assignee || null, repeats: daily };

  const plainTask = (title: string): Planned => ({
    title,
    area: "hof",
    startsOn: today,
    repeats: daily,
    intervalValue: 1,
    intervalUnit: "Tage",
    reminderTime: "08:00",
    assigneeId: assignee || null,
    assigneeName: null,
    herdId: null,
    herdName: null,
  });

  async function save(tasks: Planned[]) {
    setSaving(true);
    let saved = 0;
    try {
      for (const t of tasks) {
        await create.mutateAsync({
          farmId: farm.id,
          data: {
            title: t.title,
            // A single typed task: the server reads the area from the words.
            area: preview ? t.area : null,
            startsOn: t.startsOn,
            repeats: t.repeats,
            intervalValue: t.intervalValue,
            intervalUnit: t.intervalUnit,
            reminderTime: t.reminderTime,
            assigneeId: t.assigneeId,
            herdId: t.area === "tiere" ? t.herdId : null,
          },
        });
        saved++;
      }
      setText("");
      setPreview(null);
      toast({ title: saved === 1 ? "Aufgabe angelegt" : `${saved} Aufgaben angelegt` });
    } catch (err) {
      toast({ title: errorText(err, "Nicht gespeichert"), description: saved > 0 ? `${saved} von ${tasks.length} sind angelegt.` : undefined, variant: "destructive" });
      if (saved > 0 && preview) setPreview({ ...preview, tasks: tasks.slice(saved) });
    } finally {
      setSaving(false);
      void queryClient.invalidateQueries({ queryKey: getListFarmTasksQueryKey(farm.id) });
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const said = text.trim();
    if (!said) return;
    if (!needsPlan(said)) return void save([plainTask(splitTaskList(said)[0] ?? said)]);
    try {
      const result = await plan.mutateAsync({ farmId: farm.id, data: { text: said, assigneeId: assignee || null, repeats: daily } });
      setPreview({ tasks: result.tasks, byAi: true });
    } catch (err) {
      // Offline, daily limit or AI not reachable: the app reads it itself.
      const local = planLocally(said, today, team, defaults);
      if (local.length === 0) return void toast({ title: errorText(err, "Daraus wurde keine Aufgabe. Sag es bitte noch einmal anders."), variant: "destructive" });
      setPreview({ tasks: local, byAi: false });
      toast({ title: "Ohne KI erkannt", description: errorText(err, "Die KI ist gerade nicht erreichbar.") + " Bitte prüf die Liste." });
    }
  }

  const change = (i: number, patch: Partial<Planned>) =>
    preview && setPreview({ ...preview, tasks: preview.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  return (
    <section className={cn("space-y-3 p-3.5", TOOL_FRAME)} aria-label="Neue Aufgabe" data-testid="hof-quick-card">
      <ToolCardHeader icon={<NotebookPen className="h-5 w-5" />} title={<label htmlFor="hof-quick">Neue Aufgaben</label>} hint="Sprechen oder tippen – eine oder mehrere" />
      <form onSubmit={(e) => void submit(e)} className="space-y-2">
        <textarea
          id="hof-quick"
          rows={text.length > 60 || text.includes("\n") ? 3 : 1}
          maxLength={MAX_SAID}
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Sprechen oder tippen, z. B. Eier einsammeln"
          className="w-full resize-none rounded-xl border border-orange-200 bg-background px-3 py-2.5 text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-orange-900"
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
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-2.5 text-sm", daily ? "border-orange-500 bg-orange-100 text-orange-800 dark:bg-orange-950" : "border-input")}
          >
            <Repeat className="h-4 w-4" />
            Täglich
          </button>
        </div>
        <ToolActions>
          <DictateButton value={text} onChange={(t) => { setText(t); setPreview(null); }} max={MAX_SAID} label="Aufgaben sprechen" big />
          <Button type="submit" className={TOOL_SAVE} disabled={saving || plan.isPending || !text.trim()}>
            {saving || plan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : needsPlan(text) ? <Sparkles className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {plan.isPending ? "KI plant …" : needsPlan(text) ? "Liste erstellen" : "Speichern"}
          </Button>
        </ToolActions>
      </form>
      <SpeakHint title="Einfach reinsprechen" tone="orange" testId="hof-speak-hint">
        <p>
          Halte „Halten & sprechen“ gedrückt, sag frei, was zu tun ist, und lass los, wenn du fertig bist, z. B.:{" "}
          <span className="italic">„Heute müssen die Eier eingesammelt werden, die Gänse jeden Tag gefüttert und morgen für Maria die Blumen gegossen.“</span>{" "}
          Die KI erkennt die einzelnen Aufgaben, den Tag, ob es sich wiederholt, die Uhrzeit und für wen. Vor dem Speichern siehst du alles zum Prüfen.
        </p>
      </SpeakHint>
      {preview && (
        <div className="space-y-2 rounded-xl bg-muted/60 p-2.5" data-testid="hof-preview">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {preview.byAi && <Sparkles className="h-4 w-4 text-primary" />}
            {preview.tasks.length} {preview.tasks.length === 1 ? "Aufgabe" : "Aufgaben"} {preview.byAi ? "von der KI erkannt" : "erkannt (ohne KI)"} – bitte prüfen:
          </p>
          <ul className="space-y-1.5">
            {preview.tasks.map((t, i) => (
              <li key={i} className="space-y-1.5 rounded-lg bg-background p-2" data-testid="hof-planned">
                <div className="flex items-center gap-1.5">
                  <Input aria-label={`Aufgabe ${i + 1}`} value={t.title} maxLength={80} onChange={(e) => change(i, { title: e.target.value })} className="h-8 text-sm font-medium" />
                  <button type="button" aria-label={`${t.title} entfernen`} className="p-1 text-muted-foreground" onClick={() => setPreview({ ...preview, tasks: preview.tasks.filter((_, j) => j !== i) })}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded bg-muted px-1.5 py-0.5">{AREA_LABELS[t.area]}{t.herdName ? ` · ${t.herdName}` : ""}</span>
                  <select aria-label={`Tag für ${t.title}`} value={t.startsOn} onChange={(e) => change(i, { startsOn: e.target.value })} className={smallSelect}>
                    {dayOptions(t.startsOn, today).map((d) => (
                      <option key={d} value={d}>{t.repeats ? `ab ${dayLabel(d, today)}` : dayLabel(d, today)}</option>
                    ))}
                  </select>
                  <select
                    aria-label={`Wiederholung für ${t.title}`}
                    value={repeatKey(t)}
                    onChange={(e) => change(i, repeatFrom(e.target.value))}
                    className={smallSelect}
                  >
                    {repeatOptions(t).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <input aria-label={`Uhrzeit für ${t.title}`} type="time" value={t.reminderTime} onChange={(e) => e.target.value && change(i, { reminderTime: e.target.value })} className={smallSelect} />
                  {team.length > 1 && (
                    <select
                      aria-label={`Für wen: ${t.title}`}
                      value={t.assigneeId ?? ""}
                      onChange={(e) => change(i, { assigneeId: e.target.value || null, assigneeName: team.find((m) => m.userId === e.target.value)?.displayName ?? null })}
                      className={smallSelect}
                    >
                      <option value="">für alle</option>
                      {team.map((m) => (
                        <option key={m.userId} value={m.userId}>für {m.isMe ? "mich" : m.displayName}</option>
                      ))}
                    </select>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setPreview(null)} disabled={saving}>Verwerfen</Button>
            <Button type="button" size="sm" className="gap-1.5" onClick={() => void save(preview.tasks.filter((t) => t.title.trim().length >= 2))} disabled={saving || preview.tasks.length === 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {preview.tasks.length === 1 ? "Anlegen" : "Alle anlegen"}
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

const smallSelect = "h-8 rounded-md border border-input bg-background px-1.5 text-xs";

function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today and the next six days, plus the planned day if it is later. */
function dayOptions(current: string, today: string): string[] {
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, i));
  return days.includes(current) ? days : [...days, current];
}

const REPEATS: Array<[string, string]> = [
  ["once", "einmalig"],
  ["1-Tage", "jeden Tag"],
  ["2-Tage", "alle 2 Tage"],
  ["1-Wochen", "jede Woche"],
  ["2-Wochen", "alle 2 Wochen"],
  ["1-Monate", "jeden Monat"],
];

function repeatKey(t: Planned): string {
  return t.repeats ? `${t.intervalValue}-${t.intervalUnit}` : "once";
}

/** The fixed choices, plus what the plan said if it is something else ("alle 3 Tage"). */
function repeatOptions(t: Planned): Array<[string, string]> {
  const key = repeatKey(t);
  return REPEATS.some(([k]) => k === key) ? REPEATS : [...REPEATS, [key, `alle ${t.intervalValue} ${t.intervalUnit}`]];
}

function repeatFrom(key: string): Partial<Planned> {
  if (key === "once") return { repeats: false, intervalValue: 1, intervalUnit: "Tage" };
  const [n, unit] = key.split("-");
  return { repeats: true, intervalValue: Number(n), intervalUnit: unit as Planned["intervalUnit"] };
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

/** Sharing the list (admins): the Hof-Aufgaben, the own Alltagsnotizen, or both. */
function TeamCard({ farm, team }: { farm: FarmSummary; team: ReturnType<typeof useTeam> }) {
  const [open, setOpen] = useState(false);
  if (farm.role !== "admin") return null;
  const count = team.length;
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm">
      <Users className="h-5 w-5 shrink-0 text-primary" />
      <span className="flex-1">
        <span className="block font-medium">{count > 1 ? `Geteilt mit ${count - 1} ${count === 2 ? "Person" : "Personen"}` : "Liste teilen"}</span>
        <span className="block text-xs text-muted-foreground">
          Mitarbeiter haken ab, legen an und kommentieren – löschen kannst nur du.{" "}
          <Link href="/team" className="underline">Farm & Team</Link>
        </span>
      </span>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Teilen</Button>
      {open && <ShareListsDialog farm={farm} team={team} initial={{ hof: true, notes: false }} onClose={() => setOpen(false)} />}
    </div>
  );
}
