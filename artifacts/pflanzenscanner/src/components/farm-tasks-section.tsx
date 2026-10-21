import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";
import {
  getListFarmTasksQueryKey,
  useCompleteFarmTask,
  useCreateFarmTask,
  useDeleteFarmTask,
  useListFarmAnimals,
  useListFarmTasks,
  useListHerds,
  useUpdateFarmTask,
  type FarmSummary,
  type FarmTask,
  type FarmTaskAction,
  type FarmTaskInput,
  type TaskIntervalUnit,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { HubTile } from "@/components/hub-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { deDate } from "@/lib/farm-health";
import { todayIso } from "@/lib/farm-labels";

const ACTIONS: FarmTaskAction[] = [
  "Füttern",
  "Tränken",
  "Ausmisten",
  "Eier sammeln",
  "Entwurmen",
  "Impfen",
  "Klauen-/Hufpflege",
  "Gesundheitskontrolle",
  "Sonstiges",
];
const UNITS: TaskIntervalUnit[] = ["Tage", "Wochen", "Monate"];

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

/** "jeden Tag", "alle 2 Wochen" */
export function intervalText(value: number, unit: TaskIntervalUnit): string {
  if (value === 1) return unit === "Tage" ? "jeden Tag" : unit === "Wochen" ? "jede Woche" : "jeden Monat";
  return `alle ${value} ${unit}`;
}

/** "heute fällig", "überfällig seit 3.5.2026", "nächstes Mal am 9.5.2026" */
export function dueText(task: Pick<FarmTask, "dueDate" | "isDue">, today: string): string {
  if (!task.isDue) return `nächstes Mal am ${deDate(task.dueDate)}`;
  return task.dueDate >= today ? "heute fällig" : `überfällig seit ${deDate(task.dueDate)}`;
}

/** Due ones first, then by next due day and time. */
export function sortTasks(tasks: FarmTask[]): FarmTask[] {
  return [...tasks].sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) ||
      Number(b.isDue) - Number(a.isDue) ||
      a.dueDate.localeCompare(b.dueDate) ||
      a.reminderTime.localeCompare(b.reminderTime),
  );
}

type Target = "farm" | `a:${number}` | `h:${number}`;

function TaskDialog({
  farmId,
  task,
  onClose,
}: {
  farmId: number;
  /** null: new task */
  task: FarmTask | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const animals = useListFarmAnimals(farmId);
  const herds = useListHerds(farmId);
  const [action, setAction] = useState<FarmTaskAction>(task?.actionType ?? "Füttern");
  const [target, setTarget] = useState<Target>(
    task?.animalId ? `a:${task.animalId}` : task?.herdId ? `h:${task.herdId}` : "farm",
  );
  const [intervalValue, setIntervalValue] = useState(String(task?.intervalValue ?? 1));
  const [intervalUnit, setIntervalUnit] = useState<TaskIntervalUnit>(task?.intervalUnit ?? "Tage");
  const [reminderTime, setReminderTime] = useState(task?.reminderTime ?? "07:00");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [isActive, setIsActive] = useState(task?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: getListFarmTasksQueryKey(farmId) });
    onClose();
  };
  const fail = (err: unknown) => setError(errorText(err, "Das hat nicht geklappt."));
  const create = useCreateFarmTask({ mutation: { onSuccess: done, onError: fail } });
  const update = useUpdateFarmTask({ mutation: { onSuccess: done, onError: fail } });
  const remove = useDeleteFarmTask({ mutation: { onSuccess: done, onError: fail } });
  const busy = create.isPending || update.isPending || remove.isPending;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const data: FarmTaskInput = {
      actionType: action,
      animalId: target.startsWith("a:") ? Number(target.slice(2)) : null,
      herdId: target.startsWith("h:") ? Number(target.slice(2)) : null,
      notes,
      intervalValue: Number(intervalValue),
      intervalUnit,
      reminderTime,
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
            <DialogTitle>{task ? "Stall-Aufgabe bearbeiten" : "Neue Stall-Aufgabe"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-action">Aufgabe</Label>
            <select id="task-action" className={selectClass} value={action} onChange={(e) => setAction(e.target.value as FarmTaskAction)}>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-target">Für</Label>
            <select id="task-target" className={selectClass} value={target} onChange={(e) => setTarget(e.target.value as Target)}>
              <option value="farm">Ganze Farm</option>
              {(herds.data ?? []).length > 0 && (
                <optgroup label="Herde">
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
          <div className="grid grid-cols-[4.5rem_1fr_6.5rem] gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-every">Alle</Label>
              <Input id="task-every" type="number" min={1} max={365} required value={intervalValue} onChange={(e) => setIntervalValue(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-unit">Einheit</Label>
              <select id="task-unit" className={selectClass} value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as TaskIntervalUnit)}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-time">Uhrzeit</Label>
              <Input id="task-time" type="time" required value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-notes">Notiz</Label>
            <Input id="task-notes" maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="z. B. 2 Schaufeln Legemehl" />
          </div>
          {task && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
              Aktiv (Erinnerungen senden)
            </label>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            {task && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto gap-1.5 text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Diese Stall-Aufgabe löschen?")) remove.mutate({ farmId, taskId: task.id });
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

/** Stall tasks of the active farm on the "Meine Farm" page. */
export function FarmTasksSection({ farm }: { farm: FarmSummary }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const tasks = useListFarmTasks(farm.id);
  const [dialog, setDialog] = useState<{ task: FarmTask | null; key: number } | null>(null);
  const canWrite = farm.role !== "guest";
  const complete = useCompleteFarmTask({
    mutation: {
      onSuccess(updated) {
        void queryClient.invalidateQueries({ queryKey: getListFarmTasksQueryKey(farm.id) });
        toast({ title: `${updated.actionType} erledigt`, description: dueText(updated, todayIso()) });
      },
      onError: () => toast({ title: "Nicht gespeichert", variant: "destructive" }),
    },
  });
  const today = todayIso();
  const all = sortTasks(tasks.data ?? []);
  const dueCount = all.filter((t) => t.isActive && t.isDue).length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <ClipboardList className="h-4 w-4 text-primary" />
          Stall-Aufgaben
          {dueCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">{dueCount} fällig</span>
          )}
        </h2>
        {canWrite && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog({ task: null, key: Date.now() })}>
            <Plus className="h-4 w-4" />
            Aufgabe
          </Button>
        )}
      </div>

      {tasks.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : all.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canWrite
            ? "Noch keine Stall-Aufgaben. Leg z. B. „Füttern – jeden Tag um 7 Uhr“ an; Admins und Mitarbeiter bekommen dann eine Push-Erinnerung."
            : "Auf dieser Farm gibt es noch keine Stall-Aufgaben."}
        </p>
      ) : (
        <ul className="space-y-2">
          {all.map((t) => {
            const target = t.animalName ?? t.herdName ?? "Ganze Farm";
            const info = (
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {t.actionType} <span className="font-normal text-muted-foreground">· {target}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.isActive ? (
                    <span className={cn(t.isDue && "font-medium text-primary")}>{dueText(t, today)}</span>
                  ) : (
                    "pausiert"
                  )}
                  {` · ${intervalText(t.intervalValue, t.intervalUnit)}, ${t.reminderTime} Uhr`}
                </p>
                {t.notes && <p className="truncate text-xs text-muted-foreground">{t.notes}</p>}
              </div>
            );
            return (
              <li
                key={t.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border bg-card p-2.5 text-sm",
                  t.isActive && t.isDue ? "border-primary/50" : "border-border",
                  !t.isActive && "opacity-60",
                )}
              >
                {canWrite ? (
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDialog({ task: t, key: Date.now() })}>
                    {info}
                  </button>
                ) : (
                  info
                )}
                {canWrite && t.isActive && (
                  <Button
                    size="sm"
                    variant={t.isDue ? "default" : "outline"}
                    className="shrink-0 gap-1"
                    aria-label={`${t.actionType} (${target}) erledigt`}
                    disabled={complete.isPending}
                    onClick={() => complete.mutate({ farmId: farm.id, taskId: t.id })}
                  >
                    <Check className="h-4 w-4" />
                    Erledigt
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {dialog && <TaskDialog key={dialog.key} farmId={farm.id} task={dialog.task} onClose={() => setDialog(null)} />}
    </section>
  );
}

/** Top of the Tiere page, like the Pflegeplan on Pflanzen: what is due today in the barn. */
export function FarmTodayCard({ farm }: { farm: FarmSummary }) {
  const tasks = useListFarmTasks(farm.id);
  const active = (tasks.data ?? []).filter((t) => t.isActive);
  const due = active.filter((t) => t.isDue).length;
  return (
    <Link
      href="/farm/aufgaben"
      className="block rounded-3xl bg-primary text-primary-foreground p-5 space-y-2 shadow-md active:scale-[0.99] transition-transform"
      data-testid="farm-today"
    >
      <span className="flex items-center justify-between">
        <span className="text-lg font-semibold">Stall-Aufgaben</span>
        <ClipboardList className="w-5 h-5 opacity-80" />
      </span>
      <span className="block text-sm opacity-90">
        {active.length === 0
          ? "Noch keine Aufgaben. Lege Füttern, Ausmisten oder Eier sammeln mit Erinnerung an."
          : due > 0
            ? `${due} ${due === 1 ? "Aufgabe ist" : "Aufgaben sind"} heute fällig`
            : `Heute ist alles erledigt – ${active.length} ${active.length === 1 ? "Aufgabe" : "Aufgaben"} im Plan`}
      </span>
    </Link>
  );
}

/** The Stall-Aufgaben tile on the Tiere page, with what is due today. */
export function FarmTasksTile({ farm }: { farm: FarmSummary }) {
  const tasks = useListFarmTasks(farm.id);
  const due = (tasks.data ?? []).filter((t) => t.isActive && t.isDue).length;
  return (
    <HubTile
      href="/farm/aufgaben"
      icon={ClipboardList}
      label="Stall-Aufgaben"
      hint="Füttern, Ausmisten, Erinnerungen"
      tone="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
      badge={due > 0 ? `${due} fällig` : null}
    />
  );
}
