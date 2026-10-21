import type { Task } from "@workspace/api-client-react";

/**
 * Hof-Dashboard: every module gets a slim widget. The registry below is the
 * single list of what exists; the Hof page shows the widgets of a layout
 * (for now the default one – later the account picks its own, docs/dashboard.md).
 */

export type WidgetArea = "pflanzen" | "tiere";

export type WidgetId =
  | "plant-tasks"
  | "garden"
  | "seeds"
  | "grow"
  | "farm-tasks"
  | "animals"
  | "duties"
  | "feed"
  | "medicines"
  | "breeding"
  | "yields";

export interface WidgetDef {
  id: WidgetId;
  area: WidgetArea;
  /** Name in the widget list ("Dashboard anpassen", later). */
  title: string;
  /** What the widget shows, for that list. */
  description: string;
  /** Needs Premium (none yet – the AI widgets will). */
  premium?: boolean;
}

export const WIDGETS: readonly WidgetDef[] = [
  { id: "plant-tasks", area: "pflanzen", title: "Pflegeplan", description: "Was heute gegossen, gedüngt oder besprüht werden will" },
  { id: "garden", area: "pflanzen", title: "Beete", description: "Säen, Pflanzen und Ernten der nächsten Tage" },
  { id: "seeds", area: "pflanzen", title: "Saatgut", description: "Samen, die bald zu alt sind oder geprüft werden sollten" },
  { id: "grow", area: "pflanzen", title: "Grow", description: "Pflanzen im Grow und der nächste Schritt (ab 18)" },
  { id: "farm-tasks", area: "tiere", title: "Stall-Aufgaben", description: "Was heute im Stall fällig ist" },
  { id: "animals", area: "tiere", title: "Tiere", description: "Bestand nach Tierart" },
  { id: "duties", area: "tiere", title: "Pflichten", description: "Offene Meldungen und Fristen" },
  { id: "feed", area: "tiere", title: "Futtervorrat", description: "Futter, das bald leer ist" },
  { id: "medicines", area: "tiere", title: "Arzneimittel", description: "Mittel, die ablaufen oder abgelaufen sind" },
  { id: "breeding", area: "tiere", title: "Zucht", description: "Laufende Trächtigkeiten und Bruten mit Termin" },
  { id: "yields", area: "tiere", title: "Ertrag", description: "Ertrag und Bilanz des Jahres" },
];

/** The dashboard every account starts with. */
export const DEFAULT_LAYOUT: readonly WidgetId[] = ["plant-tasks", "garden", "farm-tasks", "animals", "duties", "feed", "medicines", "breeding"];

export function widgetsOf(layout: readonly WidgetId[], area: WidgetArea): WidgetDef[] {
  return layout.map((id) => WIDGETS.find((w) => w.id === id)).filter((w): w is WidgetDef => !!w && w.area === area);
}

const UNIT_DAYS: Record<string, number> = { Tage: 1, Wochen: 7, Monate: 30 };

/** A care task is due when its interval since the last time (or since it was created) is over – by day, not by minute. */
export function plantTaskDue(task: Pick<Task, "isActive" | "lastCompletedAt" | "createdAt" | "intervalValue" | "intervalUnit">, now = new Date()): boolean {
  if (!task.isActive) return false;
  const ref = new Date(task.lastCompletedAt ?? task.createdAt);
  const due = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + task.intervalValue * (UNIT_DAYS[task.intervalUnit] ?? 1));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return today >= due;
}

/** "3 Hühner, 2 Ziegen und 1 weitere Art" – the biggest groups first. */
export function topCounts<T extends string>(items: readonly T[], label: (key: T, n: number) => string, max = 2): string {
  const counts = new Map<T, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const shown = sorted.slice(0, max).map(([k, n]) => label(k, n));
  const rest = sorted.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} und ${rest} ${rest === 1 ? "weitere Art" : "weitere Arten"}` : shown.join(", ");
}
