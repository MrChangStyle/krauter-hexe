/**
 * Hof-Aufgaben (docs/hof-aufgaben.md): the shared list of the farm – what is
 * open today, what is done, what comes next – and turning a typed or spoken
 * list into single tasks.
 */
import type { FarmTask, FarmTaskArea } from "@workspace/api-client-react";

export const AREA_LABELS: Record<FarmTaskArea, string> = {
  tiere: "Tiere",
  garten: "Garten",
  hof: "Hof & Haus",
};

export type HofFilter = "all" | "mine" | FarmTaskArea;

/** What a task is called in the list: the own wording, else the action. */
export function taskTitle(t: Pick<FarmTask, "title" | "actionType">): string {
  return t.title ?? t.actionType;
}

function matches(t: FarmTask, filter: HofFilter, me: string | null): boolean {
  if (filter === "all") return true;
  // "Für mich": mine and those for everyone.
  if (filter === "mine") return t.assigneeId === null || t.assigneeId === me;
  return t.area === filter;
}

/** "in 7 Tagen" counts as soon. */
const SOON_DAYS = 7;

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The list for today: open (due today or overdue, by time), done today, and
 * the next seven days. Paused tasks and finished one-offs are left out.
 */
export function hofToday(tasks: FarmTask[], today: string, filter: HofFilter = "all", me: string | null = null) {
  const list = tasks.filter((t) => t.isActive && matches(t, filter, me));
  const byTime = (a: FarmTask, b: FarmTask) => a.dueDate.localeCompare(b.dueDate) || a.reminderTime.localeCompare(b.reminderTime) || a.id - b.id;
  const open = list.filter((t) => t.isDue).sort(byTime);
  const done = list.filter((t) => t.doneToday && !t.isDue).sort(byTime);
  const soonEnd = addDays(today, SOON_DAYS);
  const soon = list.filter((t) => !t.isDue && !t.doneToday && !t.isDone && t.dueDate <= soonEnd).sort(byTime);
  return { open, done, soon };
}

/** "jeden Tag", "alle 2 Wochen", "einmalig am 27.10." */
export function scheduleText(t: Pick<FarmTask, "repeats" | "intervalValue" | "intervalUnit" | "startsOn" | "dueDate">): string {
  if (!t.repeats) {
    const [, m, d] = (t.startsOn ?? t.dueDate).split("-");
    return `einmalig am ${Number(d)}.${Number(m)}.`;
  }
  if (t.intervalValue === 1) return t.intervalUnit === "Tage" ? "jeden Tag" : t.intervalUnit === "Wochen" ? "jede Woche" : "jeden Monat";
  return `alle ${t.intervalValue} ${t.intervalUnit}`;
}

/** "seit 2 Tagen" for an overdue task, else null. */
export function overdueText(dueDate: string, today: string): string | null {
  if (dueDate >= today) return null;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000);
  return days === 1 ? "seit gestern" : `seit ${days} Tagen`;
}

/** At most this many tasks from one list. */
export const MAX_LIST = 20;

/**
 * A typed or spoken list → single tasks. New lines, commas, semicolons and
 * the sentences of the dictation (lib/speech.ts ends each phrase with a dot)
 * separate them, and so do the spoken words "dann", "danach", "außerdem",
 * "und dann", "nächste Aufgabe". A plain "und" does not: "Nassfutter und
 * Trockenfutter geben" stays one task.
 */
export function splitTaskList(text: string): string[] {
  const parts = text
    .replace(/\b(und dann|und danach|dann noch|danach|außerdem|nächste aufgabe|neue aufgabe|dann)\b/gi, "\n")
    .split(/[\n,;]+|[.!?](?:\s+|$)/)
    .map((p) => p.trim().replace(/^[-•*\d.)\s]+/, "").replace(/[.!?]+$/, "").trim())
    .filter((p) => p.length >= 2)
    .map((p) => (p.charAt(0).toLocaleUpperCase("de-DE") + p.slice(1)).slice(0, 80));
  return [...new Set(parts)].slice(0, MAX_LIST);
}
