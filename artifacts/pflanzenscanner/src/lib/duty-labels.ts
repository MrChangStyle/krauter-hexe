import type { FarmDuties, FarmDuty, FarmSpecies } from "@workspace/api-client-react";
import { SPECIES_LABELS } from "@/lib/farm-labels";
import { deDay } from "@/lib/medicine-labels";

const PLURAL: Record<FarmSpecies, string> = {
  poultry: "Geflügel",
  rabbit: "Kaninchen",
  guineaPig: "Meerschweinchen",
  cat: "Katzen",
  horse: "Pferde",
  dog: "Hunde",
  goat: "Ziegen",
  sheep: "Schafe",
  cattle: "Rinder",
  pig: "Schweine",
  other: "Sonstige",
};

/** "1 Ziege", "3 Ziegen", "12 Geflügel" */
export function speciesCount(species: FarmSpecies, n: number): string {
  return `${n} ${n === 1 ? SPECIES_LABELS[species] : PLURAL[species]}`;
}

/** The badge for a duty: what to do, or null for rules and tips. */
export function dutyBadge(d: Pick<FarmDuty, "status" | "doneOn" | "dueOn" | "period">): { label: string; tone: string } | null {
  switch (d.status) {
    case "open":
      return { label: "Offen", tone: "bg-amber-400 text-amber-950" };
    case "due":
      return { label: `Fällig bis ${deDay(d.dueOn!)}`, tone: "bg-amber-400 text-amber-950" };
    case "overdue":
      return { label: `${d.period} noch nicht abgehakt`, tone: "bg-red-600 text-white" };
    case "done":
      return { label: d.period === "once" ? `Erledigt am ${deDay(d.doneOn!)}` : `${d.period} gemeldet`, tone: "bg-emerald-600 text-white" };
    case "upcoming":
      return { label: `Stichtag 01.01.${d.period}`, tone: "bg-muted text-muted-foreground" };
    default:
      return null;
  }
}

/** Duties waiting for the admins (shown as a count on the farm page). */
export function openDuties(duties: FarmDuties["duties"]): number {
  return duties.filter((d) => d.status === "open" || d.status === "due" || d.status === "overdue").length;
}

/** "Stand 1. Januar 2026: 1 Ziege, 12 Geflügel" / "Heute: 3 Schafe (Stichtag 01.01.2027)" */
export function stockText(stock: NonNullable<FarmDuty["stock"]>): string {
  const counts = stock.counts.map((c) => speciesCount(c.species, c.count)).join(", ") || "keine Tiere";
  return stock.current ? `Heute laut App: ${counts}` : `Stand 1. Januar ${stock.day.slice(0, 4)} laut App: ${counts}`;
}
