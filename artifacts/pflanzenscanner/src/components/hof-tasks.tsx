import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ListChecks, Loader2, MessageCircle, Mic, NotebookPen, Pencil, Send, Trash2, X } from "lucide-react";
import {
  getListFarmMembersQueryKey,
  getListFarmTasksQueryKey,
  useAddFarmTaskComment,
  useCompleteFarmTask,
  useCreateFarmTask,
  useDeleteFarmTask,
  useDeleteFarmTaskComment,
  useListFarmAnimals,
  useListFarmMembers,
  useListFarmTasks,
  useListHerds,
  useListNotes,
  useUncompleteFarmTask,
  useUpdateFarmTask,
  type FarmMember,
  type FarmSummary,
  type FarmTask,
  type FarmTaskArea,
  type FarmTaskInput,
  type TaskIntervalUnit,
} from "@workspace/api-client-react";
import { DictateButton } from "@/components/dictate-button";
import { TOOL_FRAME } from "@/components/tool-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/farm-labels";
import { farmModuleGranted } from "@/lib/modules";
import { AREA_LABELS, hofToday, overdueText, scheduleText, taskTitle } from "@/lib/hof-tasks";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const AREAS: FarmTaskArea[] = ["tiere", "garten", "hof"];
const UNITS: TaskIntervalUnit[] = ["Tage", "Wochen", "Monate"];

const AREA_TONE: Record<FarmTaskArea, string> = {
  tiere: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  garten: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  hof: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
};

export function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

/** The team for the "Für" choice; empty without the Farm & Team module. */
export function useTeam(farm: FarmSummary | null): FarmMember[] {
  const farmId = farm?.id ?? 0;
  const members = useListFarmMembers(farmId, {
    query: { enabled: farm !== null && farmModuleGranted(farm, "members"), queryKey: getListFarmMembersQueryKey(farmId), staleTime: 5 * 60 * 1000 },
  });
  return (members.data ?? []).filter((m) => m.role !== "guest");
}

function useRefresh(farmId: number) {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: getListFarmTasksQueryKey(farmId) });
}

// ── The two tools on the Hof ─────────────────────────────────────────────────

/**
 * The look of the two everyday tools: square, orange frame, stands out from
 * the widgets. Always exactly square – a long line is cut, never makes one
 * tile taller than the other.
 */
const TOOL_TILE = `flex aspect-square min-h-0 min-w-0 flex-col overflow-hidden p-3 text-left transition active:scale-[0.98] ${TOOL_FRAME}`;

function ToolTile({ href, icon, title, value, line, progress, testId }: { href: string; icon: ReactNode; title: string; value: string; line: string; progress?: number | null; testId: string }) {
  return (
    <Link href={href} className={TOOL_TILE} data-testid={testId}>
      <span className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-white">{icon}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:bg-black/30 dark:text-orange-300">
          <Mic className="h-3 w-3" />
          Sprechen
        </span>
      </span>
      <span className="mt-2 block truncate text-sm font-semibold leading-tight text-orange-950 dark:text-orange-100">{title}</span>
      <span className="mt-auto block truncate text-2xl font-bold leading-tight text-orange-900 dark:text-orange-50">{value}</span>
      {progress !== undefined && progress !== null && (
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-orange-200/70 dark:bg-orange-900/60" aria-hidden>
          <span className="block h-full rounded-full bg-orange-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      )}
      <span className="mt-1 line-clamp-2 block text-xs text-orange-900/80 dark:text-orange-200/80">{line}</span>
    </Link>
  );
}

/** Hof-Aufgaben of today: open, done/total, what is next. */
function HofTasksTile({ farm }: { farm: FarmSummary }) {
  const tasks = useListFarmTasks(farm.id);
  const { open, done } = hofToday(tasks.data ?? [], todayIso());
  const total = open.length + done.length;
  return (
    <ToolTile
      href="/hof-aufgaben"
      testId="hof-tile-tasks"
      icon={<ListChecks className="h-5 w-5" />}
      title="Hof-Aufgaben"
      value={tasks.isLoading ? "…" : total === 0 ? "Frei" : open.length === 0 ? "Erledigt" : `${open.length} offen`}
      progress={total > 0 ? done.length / total : null}
      line={open.length > 0 ? open.slice(0, 2).map(taskTitle).join(" · ") : total > 0 ? `${done.length} von ${total} heute geschafft` : "Heute steht nichts an"}
    />
  );
}

/** Alltagsnotizen: how much is on the shopping list, the first things. */
function NotesTile() {
  const notes = useListNotes();
  const open = (notes.data ?? []).filter((n) => !n.done);
  const shopping = open.filter((n) => n.kind === "einkauf");
  const remember = open.length - shopping.length;
  return (
    <ToolTile
      href="/notizen"
      testId="hof-tile-notes"
      icon={<NotebookPen className="h-5 w-5" />}
      title="Alltagsnotizen"
      value={notes.isLoading ? "…" : open.length === 0 ? "Leer" : `${shopping.length} kaufen`}
      line={
        open.length === 0
          ? "Einkaufsliste & Merkzettel"
          : [shopping.slice(0, 2).map((n) => n.text).join(" · "), remember > 0 ? `${remember} zum Merken` : ""].filter(Boolean).join(" · ")
      }
    />
  );
}

/**
 * Under Pflanzenretter: the two tools used every day, side by side as square
 * tiles – Hof-Aufgaben (with the Freigabe) and Alltagsnotizen.
 */
export function HofTools({ farm }: { farm: FarmSummary | null }) {
  const tasks = farm !== null && farmModuleGranted(farm, "farm-tasks");
  return (
    <div className="grid auto-rows-fr grid-cols-2 gap-3" data-testid="hof-tools">
      {tasks && farm && <HofTasksTile farm={farm} />}
      <NotesTile />
    </div>
  );
}

// ── One task in the list ─────────────────────────────────────────────────────

function Comments({ farmId, task, canWrite }: { farmId: number; task: FarmTask; canWrite: boolean }) {
  const refresh = useRefresh(farmId);
  const { toast } = useToast();
  const [text, setText] = useState("");
  const fail = (err: unknown) => toast({ title: errorText(err, "Nicht gespeichert"), variant: "destructive" });
  const add = useAddFarmTaskComment({ mutation: { onSuccess: () => { setText(""); refresh(); }, onError: fail } });
  const remove = useDeleteFarmTaskComment({ mutation: { onSuccess: refresh, onError: fail } });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) add.mutate({ farmId, taskId: task.id, data: { body: text.trim() } });
  }
  return (
    <div className="space-y-2 border-t pt-2">
      {task.comments.length === 0 && <p className="text-xs text-muted-foreground">Noch kein Kommentar. Fehlt etwas? Schreib es hier dazu – das Team bekommt Bescheid.</p>}
      <ul className="space-y-1.5">
        {task.comments.map((c) => (
          <li key={c.id} className="flex items-start gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-muted-foreground">
                {c.authorName} ·{" "}
                {new Date(c.createdAt).toLocaleString("de-DE", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="break-words">{c.body}</span>
            </span>
            {canWrite && c.isOwn && (
              <button type="button" aria-label="Kommentar löschen" className="p-1 text-muted-foreground" onClick={() => remove.mutate({ farmId, taskId: task.id, commentId: c.id })}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canWrite && (
        <form onSubmit={submit} className="flex items-center gap-1.5">
          <Input
            aria-label="Kommentar"
            maxLength={300}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="z. B. Wir brauchen neue Eierkartons"
            className="h-9"
          />
          <DictateButton value={text} onChange={setText} max={300} label="Kommentar sprechen" />
          <Button type="submit" size="icon" className="h-9 w-9 shrink-0" aria-label="Kommentar senden" disabled={add.isPending || !text.trim()}>
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      )}
    </div>
  );
}

export function HofTaskRow({
  farmId,
  task,
  canWrite,
  today,
  onEdit,
}: {
  farmId: number;
  task: FarmTask;
  canWrite: boolean;
  today: string;
  onEdit?: (t: FarmTask) => void;
}) {
  const refresh = useRefresh(farmId);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const fail = (err: unknown) => toast({ title: errorText(err, "Nicht gespeichert"), variant: "destructive" });
  const complete = useCompleteFarmTask({ mutation: { onSuccess: refresh, onError: fail } });
  const uncomplete = useUncompleteFarmTask({ mutation: { onSuccess: refresh, onError: fail } });
  const done = task.doneToday && !task.isDue;
  const busy = complete.isPending || uncomplete.isPending;
  const late = task.isDue ? overdueText(task.dueDate, today) : null;
  const target = task.animalName ?? task.herdName;
  const title = taskTitle(task);

  const meta: ReactNode[] = [
    <span key="a" className={cn("rounded px-1.5 py-px text-[11px] font-medium", AREA_TONE[task.area])}>{AREA_LABELS[task.area]}</span>,
  ];
  if (target) meta.push(<span key="t">{target}</span>);
  if (task.assigneeName) meta.push(<span key="p">für {task.assigneeName}</span>);
  if (done && task.lastCompletedByName && task.lastCompletedAt) {
    meta.push(
      <span key="d">
        erledigt von {task.lastCompletedByName}, {new Date(task.lastCompletedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
      </span>,
    );
  } else {
    meta.push(<span key="s">{scheduleText(task)}</span>);
    if (late) meta.push(<span key="l" className="font-medium text-amber-700 dark:text-amber-400">{late}</span>);
    else if (!task.isDue && !done) meta.push(<span key="n">ab {new Date(`${task.dueDate}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" })}</span>);
  }

  return (
    <li className={cn("rounded-2xl border bg-card p-3", done && "border-primary/30 bg-primary/5")} data-testid="hof-task">
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `${title}: Haken zurücknehmen` : `${title} erledigt`}
          disabled={!canWrite || busy || (!done && !task.isDue)}
          onClick={() => (done ? uncomplete.mutate({ farmId, taskId: task.id }) : complete.mutate({ farmId, taskId: task.id }))}
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-60",
            done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : done && <Check className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn("break-words font-medium leading-snug", done && "text-muted-foreground line-through")}>{title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">{meta}</p>
          {task.notes && <p className="mt-1 text-xs text-muted-foreground">{task.notes}</p>}
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            aria-label={`Kommentare (${task.commentCount})`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className={cn("inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs", task.commentCount > 0 ? "text-primary" : "text-muted-foreground")}
          >
            <MessageCircle className="h-4 w-4" />
            {task.commentCount > 0 && task.commentCount}
          </button>
          {canWrite && onEdit && (
            <button type="button" aria-label={`${title} bearbeiten`} onClick={() => onEdit(task)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground">
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-2">
          <Comments farmId={farmId} task={task} canWrite={canWrite} />
        </div>
      )}
    </li>
  );
}

// ── New or changed task ──────────────────────────────────────────────────────

type Target = "farm" | `a:${number}` | `h:${number}`;
type When = "once" | "repeat" | "days";
const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function HofTaskDialog({
  farm,
  task,
  team,
  onClose,
}: {
  farm: FarmSummary;
  /** null: new task */
  task: FarmTask | null;
  team: FarmMember[];
  onClose: () => void;
}) {
  const farmId = farm.id;
  const refresh = useRefresh(farmId);
  const animals = useListFarmAnimals(farmId);
  const herds = useListHerds(farmId);
  const [title, setTitle] = useState(task ? taskTitle(task) : "");
  const [area, setArea] = useState<FarmTaskArea | null>(task?.area ?? null);
  const [target, setTarget] = useState<Target>(task?.animalId ? `a:${task.animalId}` : task?.herdId ? `h:${task.herdId}` : "farm");
  const [assignee, setAssignee] = useState(task?.assigneeId ?? "");
  const [when, setWhen] = useState<When>(task && !task.repeats ? "once" : task?.weekdays?.length ? "days" : task ? "repeat" : "once");
  const [weekdays, setWeekdays] = useState<number[]>(task?.weekdays ?? []);
  const [startsOn, setStartsOn] = useState(task?.startsOn ?? todayIso());
  const [intervalValue, setIntervalValue] = useState(String(task?.intervalValue ?? 1));
  const [intervalUnit, setIntervalUnit] = useState<TaskIntervalUnit>(task?.intervalUnit ?? "Tage");
  const [reminderTime, setReminderTime] = useState(task?.reminderTime ?? "08:00");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [isActive, setIsActive] = useState(task?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  const finish = () => {
    refresh();
    onClose();
  };
  const fail = (err: unknown) => setError(errorText(err, "Das hat nicht geklappt."));
  const create = useCreateFarmTask({ mutation: { onSuccess: finish, onError: fail } });
  const update = useUpdateFarmTask({ mutation: { onSuccess: finish, onError: fail } });
  const remove = useDeleteFarmTask({ mutation: { onSuccess: finish, onError: fail } });
  const busy = create.isPending || update.isPending || remove.isPending;

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (when === "days" && weekdays.length === 0) {
      setError("Bitte wähle mindestens einen Wochentag.");
      return;
    }
    const own = title.trim();
    // An unchanged action name stays the action, as in the Stall-Aufgaben.
    const keepsAction = task !== null && task.title === null && own === task.actionType;
    const data: FarmTaskInput = {
      title: keepsAction ? null : own,
      actionType: keepsAction ? task.actionType : null,
      area,
      animalId: area === "tiere" && target.startsWith("a:") ? Number(target.slice(2)) : null,
      herdId: area === "tiere" && target.startsWith("h:") ? Number(target.slice(2)) : null,
      assigneeId: assignee || null,
      repeats: when !== "once",
      startsOn,
      intervalValue: when === "repeat" ? Number(intervalValue) : 1,
      intervalUnit: when === "repeat" ? intervalUnit : when === "days" ? "Wochen" : "Tage",
      weekdays: when === "days" ? weekdays : null,
      reminderTime,
      notes,
      isActive,
    };
    if (task) update.mutate({ farmId, taskId: task.id, data });
    else create.mutate({ farmId, data });
  }

  const activeAnimals = (animals.data ?? []).filter((a) => !a.archivedAt || a.id === task?.animalId);

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{task ? "Aufgabe bearbeiten" : "Neue Hof-Aufgabe"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="hof-task-title">Was ist zu tun?</Label>
              <DictateButton value={title} onChange={setTitle} max={80} label="Aufgabe sprechen" />
            </div>
            <Input id="hof-task-title" required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Teichpumpe kontrollieren" />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Bereich</legend>
            <div className="flex flex-wrap gap-1.5">
              <AreaChip active={area === null} onClick={() => setArea(null)}>Automatisch</AreaChip>
              {AREAS.map((a) => (
                <AreaChip key={a} active={area === a} onClick={() => setArea(a)}>{AREA_LABELS[a]}</AreaChip>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Tiere-Aufgaben stehen auch bei den Stall-Aufgaben, Garten-Aufgaben beim Pflegeplan.</p>
          </fieldset>
          {area === "tiere" && ((herds.data ?? []).length > 0 || activeAnimals.length > 0) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hof-task-target">Welche Tiere?</Label>
              <select id="hof-task-target" className={selectClass} value={target} onChange={(e) => setTarget(e.target.value as Target)}>
                <option value="farm">Ganzer Hof</option>
                {(herds.data ?? []).length > 0 && (
                  <optgroup label="Gruppe">
                    {(herds.data ?? []).map((h) => (
                      <option key={h.id} value={`h:${h.id}`}>{h.name}</option>
                    ))}
                  </optgroup>
                )}
                {activeAnimals.length > 0 && (
                  <optgroup label="Tier">
                    {activeAnimals.map((a) => (
                      <option key={a.id} value={`a:${a.id}`}>{a.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}
          {team.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hof-task-for">Für wen?</Label>
              <select id="hof-task-for" className={selectClass} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Alle im Team</option>
                {team.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.isMe ? `${m.displayName} (ich)` : m.displayName}</option>
                ))}
              </select>
            </div>
          )}
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Wann?</legend>
            <div className="grid grid-cols-3 gap-1.5">
              <AreaChip active={when === "once"} onClick={() => setWhen("once")}>Einmalig</AreaChip>
              <AreaChip active={when === "repeat"} onClick={() => setWhen("repeat")}>Regelmäßig</AreaChip>
              <AreaChip active={when === "days"} onClick={() => setWhen("days")}>Wochentage</AreaChip>
            </div>
            {when === "days" && (
              <div className="grid grid-cols-7 gap-1" role="group" aria-label="Wochentage">
                {WEEKDAY_SHORT.map((label, i) => {
                  const day = i + 1;
                  const on = weekdays.includes(day);
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setWeekdays(on ? weekdays.filter((d) => d !== day) : [...weekdays, day].sort((a, b) => a - b))}
                      className={`h-9 rounded-md border text-sm font-medium ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hof-task-day">{when === "once" ? "Am" : "Ab"}</Label>
              <Input id="hof-task-day" type="date" required value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hof-task-time">Erinnerung um</Label>
              <Input id="hof-task-time" type="time" required value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
            </div>
          </div>
          {when === "repeat" && (
            <div className="grid grid-cols-[4.5rem_1fr] gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hof-task-every">Alle</Label>
                <Input id="hof-task-every" type="number" min={1} max={365} required value={intervalValue} onChange={(e) => setIntervalValue(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hof-task-unit">Einheit</Label>
                <select id="hof-task-unit" className={selectClass} value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as TaskIntervalUnit)}>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="hof-task-notes">Notiz</Label>
              <DictateButton value={notes} onChange={setNotes} max={200} />
            </div>
            <Input id="hof-task-notes" maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="z. B. Kescher hängt im Schuppen" />
          </div>
          {task && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
              Aktiv (in der Liste, mit Erinnerung)
            </label>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            {/* Only the owner of the list – an admin – deletes; Mitarbeiter tick off and add. */}
            {task && farm.role === "admin" && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto gap-1.5 text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Diese Aufgabe löschen?")) remove.mutate({ farmId, taskId: task.id });
                }}
              >
                <Trash2 className="h-4 w-4" />
                Löschen
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={busy} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AreaChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ── Garden tasks in the Pflegeplan ───────────────────────────────────────────

/** The Hof-Aufgaben of the garden, on the Pflegeplan page: today and the next days. */
export function GardenHofTasks({ farm }: { farm: FarmSummary }) {
  const tasks = useListFarmTasks(farm.id, { query: { enabled: farmModuleGranted(farm, "farm-tasks"), queryKey: getListFarmTasksQueryKey(farm.id) } });
  const today = todayIso();
  const { open, done, soon } = hofToday(tasks.data ?? [], today, "garten");
  const list = [...open, ...done, ...soon];
  if (list.length === 0) return null;
  return (
    <section className="space-y-2" aria-labelledby="garden-hof-tasks">
      <div className="flex items-center justify-between gap-2">
        <h2 id="garden-hof-tasks" className="font-semibold">Garten-Aufgaben vom Hof</h2>
        <Link href="/hof-aufgaben" className="text-sm text-primary">Hof-Aufgaben</Link>
      </div>
      <ul className="space-y-2">
        {list.map((t) => (
          <HofTaskRow key={t.id} farmId={farm.id} task={t} canWrite={farm.role !== "guest"} today={today} />
        ))}
      </ul>
    </section>
  );
}
