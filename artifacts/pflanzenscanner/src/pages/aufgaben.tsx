import { useState, useEffect, useRef } from "react";
import { isPushEnabled } from "@/lib/push";
import { useSearch, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useCompleteTask,
  useDeleteTask,
  getListTasksQueryKey,
  useListPlants,
} from "@workspace/api-client-react";
import type { Task } from "@workspace/api-client-react";
import { plantImageUrl } from "@/lib/image";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ClipboardList,
  CheckCircle2,
  Trash2,
  Plus,
  Droplets,
  Sprout,
  Wind,
  RefreshCcw,
  Bell,
  Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_TYPES = ["Gießen", "Besprühen", "Düngen", "Pflanze drehen"] as const;
const INTERVAL_UNITS = ["Tage", "Wochen", "Monate"] as const;

const FERTILIZER_TYPES = [
  { value: "Biologischer Dünger", label: "Biologischer Dünger" },
  { value: "Mineralischer Dünger", label: "Mineralischer Dünger" },
  { value: "Manuell", label: "Eigener Dünger (Manuelle Eingabe)" },
] as const;

const ACTION_ICONS: Record<string, React.ReactNode> = {
  Gießen: <Droplets className="w-4 h-4 text-sky-500" />,
  Besprühen: <Wind className="w-4 h-4 text-teal-500" />,
  Düngen: <Sprout className="w-4 h-4 text-emerald-600" />,
  "Pflanze drehen": <RefreshCcw className="w-4 h-4 text-amber-500" />,
};

const ACTION_BG: Record<string, string> = {
  Gießen: "bg-sky-50 dark:bg-sky-950/40",
  Besprühen: "bg-teal-50 dark:bg-teal-950/40",
  Düngen: "bg-emerald-50 dark:bg-emerald-950/40",
  "Pflanze drehen": "bg-amber-50 dark:bg-amber-950/40",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function intervalLabel(task: Task) {
  return `Alle ${task.intervalValue} ${task.intervalUnit} um ${task.reminderTime} Uhr`;
}

function fertilizerLabel(task: Task): string | null {
  if (!task.fertilizerType) return null;
  if (task.fertilizerType === "Manuell") {
    return task.fertilizerCustomName?.trim() || "Eigener Dünger";
  }
  return task.fertilizerType;
}

function unitToMs(unit: string): number {
  if (unit === "Wochen") return 7 * 24 * 60 * 60 * 1000;
  if (unit === "Monate") return 30 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function isTaskDueNow(task: Task): boolean {
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (hhmm !== task.reminderTime) return false;
  const ref = task.lastCompletedAt ? new Date(task.lastCompletedAt) : new Date(task.createdAt);
  const nextDue = new Date(ref.getTime() + task.intervalValue * unitToMs(task.intervalUnit));
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueMidnight = new Date(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate());
  return todayMidnight >= dueMidnight;
}

// ─── Form state helper ───────────────────────────────────────────────────────

interface FormState {
  plantId: string;
  actionType: string;
  intervalValue: string;
  intervalUnit: string;
  reminderTime: string;
  fertilizerType: string;
  fertilizerCustomName: string;
}

const DEFAULT_FORM: FormState = {
  plantId: "",
  actionType: "Gießen",
  intervalValue: "3",
  intervalUnit: "Tage",
  reminderTime: "08:00",
  fertilizerType: "",
  fertilizerCustomName: "",
};

function formFromTask(task: Task): FormState {
  return {
    plantId: String(task.plantId),
    actionType: task.actionType,
    intervalValue: String(task.intervalValue),
    intervalUnit: task.intervalUnit,
    reminderTime: task.reminderTime,
    fertilizerType: task.fertilizerType ?? "",
    fertilizerCustomName: task.fertilizerCustomName ?? "",
  };
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function AufgabenPage() {
  const queryClient = useQueryClient();
  const search = useSearch();
  const [, setLocation] = useLocation();

  const preselectedPlantId = new URLSearchParams(search).get("plantId") ?? "";

  const { data: tasks = [], isLoading: tasksLoading } = useListTasks();
  const { data: plants = [] } = useListPlants(undefined, {
    query: { queryKey: ["/api/plants"] },
  });

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();

  // ── Form / edit state ──────────────────────────────────────────────────────
  // editingTask: null = create mode, Task = edit mode
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showForm, setShowForm] = useState(!!preselectedPlantId);
  const [form, setForm] = useState<FormState>({
    ...DEFAULT_FORM,
    plantId: preselectedPlantId,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Delete confirm ─────────────────────────────────────────────────────────
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // ── Notification ticker ────────────────────────────────────────────────────
  const firedRef = useRef<Set<string>>(new Set());

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Strip ?plantId from URL after reading it
  useEffect(() => {
    if (preselectedPlantId) setLocation("/aufgaben", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const supported = typeof Notification !== "undefined";
    // When server push is active on this device, the server already sends
    // these reminders - skip the local fallback to avoid duplicates.
    let pushActive = false;
    void isPushEnabled().then((enabled) => {
      pushActive = enabled;
    });
    const tick = () => {
      if (pushActive) return;
      if (!tasks.length || !supported || Notification.permission !== "granted") return;
      const now = new Date();
      for (const task of tasks) {
        if (!task.isActive) continue;
        const key = `${task.id}-${task.reminderTime}-${now.toDateString()}-${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        if (!firedRef.current.has(key) && isTaskDueNow(task)) {
          firedRef.current.add(key);
          const plant = plants.find((p) => p.id === task.plantId);
          new Notification(`${task.actionType} für ${plant?.germanName ?? "deine Pflanze"} steht an!`, {
            body: intervalLabel(task),
            icon: "/icons/icon-192x192.png",
          });
        }
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [tasks, plants]);

  const invalidateTasks = () =>
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });

  // ── Open edit mode ─────────────────────────────────────────────────────────
  const openEdit = (task: Task) => {
    setEditingTask(task);
    setForm(formFromTask(task));
    setFormError(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Close / reset form ────────────────────────────────────────────────────
  const closeForm = () => {
    setShowForm(false);
    setEditingTask(null);
    setForm(DEFAULT_FORM);
    setFormError(null);
  };

  // ── Save (create or update) ───────────────────────────────────────────────
  const handleSave = async () => {
    setFormError(null);
    if (!form.plantId) { setFormError("Bitte eine Pflanze auswählen."); return; }
    if (!form.actionType) { setFormError("Bitte einen Aufgabentyp auswählen."); return; }
    setSaving(true);

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    const fertilizerPayload =
      form.actionType === "Düngen" && form.fertilizerType
        ? {
            fertilizerType: form.fertilizerType as "Biologischer Dünger" | "Mineralischer Dünger" | "Manuell",
            ...(form.fertilizerType === "Manuell" ? { fertilizerCustomName: form.fertilizerCustomName } : {}),
          }
        : form.actionType !== "Düngen"
          ? { fertilizerType: null, fertilizerCustomName: null }
          : {};

    const onSuccess = () => { void invalidateTasks(); closeForm(); setSaving(false); };
    const onError = () => { setFormError("Speichern fehlgeschlagen. Bitte versuche es erneut."); setSaving(false); };

    if (editingTask) {
      updateTask.mutate(
        {
          id: editingTask.id,
          data: {
            actionType: form.actionType as "Gießen" | "Besprühen" | "Düngen" | "Pflanze drehen",
            intervalValue: Number(form.intervalValue),
            intervalUnit: form.intervalUnit as "Tage" | "Wochen" | "Monate",
            reminderTime: form.reminderTime,
            ...fertilizerPayload,
          },
        },
        { onSuccess, onError },
      );
    } else {
      createTask.mutate(
        {
          data: {
            plantId: Number(form.plantId),
            actionType: form.actionType as "Gießen" | "Besprühen" | "Düngen" | "Pflanze drehen",
            intervalValue: Number(form.intervalValue),
            intervalUnit: form.intervalUnit as "Tage" | "Wochen" | "Monate",
            reminderTime: form.reminderTime,
            ...fertilizerPayload,
          },
        },
        { onSuccess, onError },
      );
    }
  };

  const handleComplete = (id: number) =>
    completeTask.mutate({ id }, { onSuccess: () => void invalidateTasks() });

  const handleDeleteConfirm = () => {
    if (deleteId === null) return;
    deleteTask.mutate(
      { id: deleteId },
      { onSuccess: () => { void invalidateTasks(); setDeleteId(null); } },
    );
  };

  const sortedTasks = [...tasks].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const isPending = saving || createTask.isPending || updateTask.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-h-0 pb-8">
      {/* Header */}
      <header className="px-6 pt-8 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400">
              <ClipboardList className="w-6 h-6" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-semibold">Aufgaben</h1>
              <p className="text-xs text-muted-foreground">Pflegeerinnerungen für deine Pflanzen</p>
            </div>
          </div>
          <Button
            size="sm"
            variant={showForm && !editingTask ? "secondary" : "default"}
            onClick={() => {
              if (showForm) {
                closeForm();
              } else {
                setForm(DEFAULT_FORM);
                setEditingTask(null);
                setShowForm(true);
              }
            }}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Neue Aufgabe
          </Button>
        </div>
      </header>

      {/* Form (create OR edit) */}
      {showForm && (
        <div className="mx-6 mb-6 rounded-2xl border bg-card p-5 space-y-4 shadow-sm animate-in slide-in-from-top-2 duration-200">
          <h2 className="font-serif text-lg font-semibold">
            {editingTask ? "Aufgabe bearbeiten" : "Aufgabe erstellen"}
          </h2>

          {/* Plant selection – locked in edit mode (tasks belong to a plant permanently) */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Pflanze
            </label>
            {editingTask ? (
              <div className="flex items-center gap-2 h-10 rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
                {plants.find((p) => p.id === editingTask.plantId)?.germanName ?? `Pflanze #${editingTask.plantId}`}
              </div>
            ) : (
              <Select value={form.plantId} onValueChange={(v) => setField("plantId", v)}>
                <SelectTrigger><SelectValue placeholder="Pflanze auswählen…" /></SelectTrigger>
                <SelectContent>
                  {plants.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.germanName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Action type */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Aufgabentyp
            </label>
            <Select
              value={form.actionType}
              onValueChange={(v) => {
                setField("actionType", v);
                if (v !== "Düngen") { setField("fertilizerType", ""); setField("fertilizerCustomName", ""); }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Interval */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Rhythmus
            </label>
            <div className="flex gap-2">
              <Select value={form.intervalValue} onValueChange={(v) => setField("intervalValue", v)}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-52">
                  {Array.from({ length: 60 }, (_, i) => String(i + 1)).map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={form.intervalUnit} onValueChange={(v) => setField("intervalUnit", v)}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERVAL_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fertilizer – only when Düngen */}
          {form.actionType === "Düngen" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Düngerart
              </label>
              <Select
                value={form.fertilizerType}
                onValueChange={(v) => {
                  setField("fertilizerType", v);
                  if (v !== "Manuell") setField("fertilizerCustomName", "");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Düngerart auswählen (optional)…" /></SelectTrigger>
                <SelectContent>
                  {FERTILIZER_TYPES.map((ft) => (
                    <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.fertilizerType === "Manuell" && (
                <input
                  type="text"
                  value={form.fertilizerCustomName}
                  onChange={(e) => setField("fertilizerCustomName", e.target.value)}
                  placeholder="z.B. Orchideendünger, Tomatendünger …"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mt-2"
                />
              )}
            </div>
          )}

          {/* Reminder time */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Erinnerungszeit
            </label>
            <input
              type="time"
              value={form.reminderTime}
              onChange={(e) => setField("reminderTime", e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={closeForm}>
              Abbrechen
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={isPending}>
              {isPending ? "Wird gespeichert…" : "Speichern"}
            </Button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 px-6 space-y-3">
        {tasksLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <span className="text-sm">Wird geladen …</span>
          </div>
        )}

        {!tasksLoading && sortedTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="p-4 rounded-2xl bg-muted text-muted-foreground">
              <ClipboardList className="w-8 h-8" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-medium">Noch keine Aufgaben</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Erstelle deine erste Pflegeaufgabe mit dem Button oben oder direkt aus der Pflanzendetailansicht.
              </p>
            </div>
          </div>
        )}

        {sortedTasks.map((task) => {
          const plant = plants.find((p) => p.id === task.plantId);
          const bgClass = ACTION_BG[task.actionType] ?? "bg-muted";
          const isBeingEdited = editingTask?.id === task.id;

          return (
            <div
              key={task.id}
              className={`rounded-2xl border bg-card overflow-hidden shadow-sm transition-shadow ${isBeingEdited ? "ring-2 ring-primary" : ""}`}
            >
              <div className="flex items-center gap-3 p-4">
                {/* Plant thumbnail – clickable → plant detail */}
                <button
                  onClick={() => setLocation(`/pflanze/${task.plantId}`)}
                  title={plant ? `Zu ${plant.germanName} springen` : "Zur Pflanzendetailansicht"}
                  className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-border hover:ring-2 hover:ring-primary/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {plant ? (
                    <img
                      src={plantImageUrl(plant.id)}
                      alt={plant.germanName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Sprout className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                </button>

                {/* Task info – plant name clickable */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${bgClass}`}>
                      {ACTION_ICONS[task.actionType]}
                      {task.actionType}
                      {fertilizerLabel(task) && (
                        <span className="font-normal opacity-80">({fertilizerLabel(task)})</span>
                      )}
                    </span>
                  </div>
                  <button
                    onClick={() => setLocation(`/pflanze/${task.plantId}`)}
                    className="font-medium text-sm leading-tight truncate max-w-full text-left hover:underline hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    {plant?.germanName ?? `Pflanze #${task.plantId}`}
                  </button>
                  <div className="flex items-center gap-1 mt-1">
                    <Bell className="w-3 h-3 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground truncate">{intervalLabel(task)}</p>
                  </div>
                  {task.lastCompletedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Zuletzt erledigt:{" "}
                      {format(new Date(task.lastCompletedAt), "dd. MMM yyyy", { locale: de })}
                    </p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => handleComplete(task.id)}
                    disabled={completeTask.isPending}
                    title="Als erledigt markieren"
                    className="p-2 rounded-xl text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => openEdit(task)}
                    title="Aufgabe bearbeiten"
                    className={`p-2 rounded-xl transition-colors ${
                      isBeingEdited
                        ? "text-primary bg-primary/10"
                        : "text-sky-600 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-900/60"
                    }`}
                  >
                    <Pencil className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setDeleteId(task.id)}
                    title="Aufgabe löschen"
                    className="p-2 rounded-xl text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">Aufgabe löschen?</DialogTitle>
            <DialogDescription>
              Diese Aufgabe wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Abbrechen</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleteTask.isPending}>
              {deleteTask.isPending ? "Löschen …" : "Löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
