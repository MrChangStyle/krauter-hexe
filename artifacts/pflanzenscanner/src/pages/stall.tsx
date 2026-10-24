import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CloudOff, Egg, Loader2, Minus, Plus, Warehouse } from "lucide-react";
import {
  getGetEggsTodayQueryKey,
  getListFarmTasksQueryKey,
  useEnsureOwnFarm,
  useGetEggsToday,
  useListFarmTasks,
  type FarmSummary,
  type FarmTask,
} from "@workspace/api-client-react";
import { useModules } from "@/hooks/use-modules";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { todayIso } from "@/lib/farm-labels";
import { farmModuleGranted } from "@/lib/modules";
import { addEggs, addTaskDone, flushQueue, pendingFor, readQueue, subscribeQueue, undoEgg } from "@/lib/stall-queue";

// Without a connection the page shows what it saw last time.
const FARMS_CACHE = "lf-stall-farms";
const TASKS_CACHE = (farmId: number) => `lf-stall-tasks-${farmId}`;
const EGGS_CACHE = (farmId: number) => `lf-stall-eggs-${farmId}`;

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not stored: offline there is less to show.
  }
}

function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
      };
    },
    () => navigator.onLine,
  );
}

/** Sends the queue now, when the device comes online, a moment after each tap and every half minute. */
function useQueueSender(farmId: number) {
  const queryClient = useQueryClient();
  const version = useSyncExternalStore(subscribeQueue, () => JSON.stringify(readQueue()));
  const send = useCallback(async () => {
    if (readQueue().length === 0) return;
    if ((await flushQueue()) > 0) {
      void queryClient.invalidateQueries({ queryKey: getGetEggsTodayQueryKey(farmId) });
      void queryClient.invalidateQueries({ queryKey: getListFarmTasksQueryKey(farmId) });
    }
  }, [farmId, queryClient]);
  useEffect(() => {
    // Short pause, so quick taps go out as one entry.
    const timer = setTimeout(() => void send(), 1500);
    return () => clearTimeout(timer);
  }, [version, send]);
  useEffect(() => {
    const online = () => void send();
    window.addEventListener("online", online);
    const timer = setInterval(() => void send(), 30_000);
    return () => {
      window.removeEventListener("online", online);
      clearInterval(timer);
    };
  }, [send]);
  return version;
}

/** The farm's tasks; without a connection the list from the last visit. */
function useStallTasks(farmId: number): FarmTask[] | null {
  const tasks = useListFarmTasks(farmId);
  useEffect(() => {
    if (tasks.data) writeCache(TASKS_CACHE(farmId), tasks.data);
  }, [farmId, tasks.data]);
  return tasks.data ?? readCache<FarmTask[]>(TASKS_CACHE(farmId)) ?? (tasks.isLoading ? null : []);
}

function doneToday(task: FarmTask, today: string): boolean {
  return task.lastCompletedAt !== null && todayIso(new Date(task.lastCompletedAt)) === today && !task.isDue;
}

function Eggs({ farm, canWrite }: { farm: FarmSummary; canWrite: boolean }) {
  const today = useGetEggsToday(farm.id);
  useEffect(() => {
    if (today.data) writeCache(EGGS_CACHE(farm.id), today.data);
  }, [farm.id, today.data]);
  const pending = pendingFor(farm.id).eggs;
  const last = today.data ?? readCache<{ date: string; eggs: number }>(EGGS_CACHE(farm.id));
  const known = last && last.date === todayIso() ? last.eggs : 0;
  const total = known + pending;
  return (
    <section className="space-y-3 rounded-3xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Egg className="h-5 w-5 text-primary" />
          Eier heute
        </h2>
        <span className="text-3xl font-bold tabular-nums" data-testid="eggs-today">
          {today.isLoading && pending === 0 ? "…" : total}
        </span>
      </div>
      {canWrite && (
        <div className="grid grid-cols-[4rem_1fr] gap-3">
          <button
            type="button"
            aria-label="Ein Ei zurücknehmen"
            disabled={pending === 0}
            onClick={() => undoEgg(farm.id)}
            className="flex h-20 items-center justify-center rounded-2xl border border-border text-muted-foreground active:scale-95 disabled:opacity-40"
          >
            <Minus className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => addEggs(farm.id, 1)}
            className="flex h-20 items-center justify-center gap-2 rounded-2xl bg-primary text-2xl font-semibold text-primary-foreground shadow-md active:scale-[0.97]"
          >
            <Plus className="h-7 w-7" />1 Ei
          </button>
        </div>
      )}
      {pending > 0 && <p className="text-xs text-muted-foreground">Zurücknehmen geht, solange die Eier noch nicht gesendet sind.</p>}
    </section>
  );
}

function Tasks({ farm, canWrite }: { farm: FarmSummary; canWrite: boolean }) {
  const tasks = useStallTasks(farm.id);
  const today = todayIso();
  const pending = pendingFor(farm.id).tasks;
  if (tasks === null) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  const list = tasks
    .filter((t) => t.isActive && (t.isDue || doneToday(t, today) || pending.has(t.id)))
    .sort((a, b) => a.reminderTime.localeCompare(b.reminderTime) || a.id - b.id);
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Heute im Stall</h2>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tasks.some((t) => t.isActive) ? "Heute ist nichts mehr fällig." : "Noch keine Stall-Aufgaben. "}
          {!tasks.some((t) => t.isActive) && (
            <Link href="/farm/aufgaben" className="underline">
              Füttern, Tränken & Co. anlegen
            </Link>
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => {
            const done = pending.has(t.id) || doneToday(t, today);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={!canWrite || done}
                  aria-pressed={done}
                  onClick={() => addTaskDone(farm.id, t.id)}
                  className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border p-4 text-left active:scale-[0.98] ${
                    done ? "border-primary/40 bg-primary/10" : "border-border bg-card"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${
                      done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                    }`}
                  >
                    {done && <Check className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">{t.actionType}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {t.herdName ?? t.animalName ?? "Ganzer Hof"}
                      {t.notes ? ` · ${t.notes}` : ""}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">{done ? "erledigt" : t.reminderTime}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Stall({ farm }: { farm: FarmSummary }) {
  const { visible } = useModules();
  const online = useOnline();
  useQueueSender(farm.id);
  const waiting = pendingFor(farm.id).count;
  const canWrite = farm.role !== "guest";
  const eggs = visible("yields") && farmModuleGranted(farm, "yields");
  const tasks = visible("farm-tasks") && farmModuleGranted(farm, "farm-tasks");

  return (
    <div className="space-y-5">
      {(!online || waiting > 0) && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" role="status">
          <CloudOff className="h-4 w-4 shrink-0" />
          {online
            ? `${waiting} ${waiting === 1 ? "Eintrag wird" : "Einträge werden"} gesendet …`
            : waiting > 0
              ? `Kein Netz. ${waiting} ${waiting === 1 ? "Eintrag ist" : "Einträge sind"} gespeichert und ${waiting === 1 ? "wird" : "werden"} gesendet, sobald Netz da ist.`
              : "Kein Netz. Was du hier tippst, wird gespeichert und später gesendet."}
        </p>
      )}
      {!canWrite && <p className="text-sm text-muted-foreground">Als Gast kannst du hier nur nachsehen.</p>}
      {eggs && <Eggs farm={farm} canWrite={canWrite} />}
      {tasks && <Tasks farm={farm} canWrite={canWrite} />}
      {!eggs && !tasks && <p className="text-sm text-muted-foreground">Für diese Farm sind weder Ertrag noch Stall-Aufgaben freigegeben.</p>}
    </div>
  );
}

/** /farm/stall – Schnell-Erfassen: one tap per egg or task, works offline (docs/stall.md). */
export default function StallPage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({
    mutation: {
      onSuccess(list) {
        writeCache(FARMS_CACHE, list);
        setFarms(list);
      },
      onError: () => setFarms(readCache<FarmSummary[]>(FARMS_CACHE) ?? []),
    },
  });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/farm" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Tiere
      </Link>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Warehouse className="h-6 w-6 text-primary" />
          Am Stall
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Ein Tipp pro Ei, ein Tipp pro Aufgabe – geht auch ohne Netz.</p>
      </div>
      {farms === null ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : !farm ? (
        <p className="text-sm text-muted-foreground">Ohne Netz kennt die App deine Farm noch nicht. Öffne „Am Stall“ einmal mit Netz, danach geht es auch ohne.</p>
      ) : (
        <Stall farm={farm} />
      )}
    </div>
  );
}
