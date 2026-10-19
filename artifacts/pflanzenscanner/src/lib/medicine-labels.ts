import type { Medicine } from "@workspace/api-client-react";

export const MEDICINE_STATUS: Record<Medicine["status"], { label: string; tone: string }> = {
  expired: { label: "Abgelaufen", tone: "bg-red-600 text-white" },
  expiresSoon: { label: "Läuft bald ab", tone: "bg-amber-400 text-amber-950" },
  empty: { label: "Leer", tone: "bg-muted text-muted-foreground" },
  ok: { label: "Im Vorrat", tone: "bg-emerald-600 text-white" },
  archived: { label: "Aufgebraucht", tone: "bg-muted text-muted-foreground" },
};

/** "2027-03-31" → "31.03.2027" */
export function deDay(day: string): string {
  return day.split("-").reverse().join(".");
}

/** "Fleisch 7 Tage · Milch 4 Tage · Eier 0 Tage", or null when none is given. */
export function medicineWithdrawal(m: Pick<Medicine, "withdrawalMeatDays" | "withdrawalMilkDays" | "withdrawalEggsDays">): string | null {
  const parts = (
    [
      ["Fleisch", m.withdrawalMeatDays],
      ["Milch", m.withdrawalMilkDays],
      ["Eier", m.withdrawalEggsDays],
    ] as const
  )
    .filter(([, d]) => d !== null)
    .map(([what, d]) => `${what} ${d} ${d === 1 ? "Tag" : "Tage"}`);
  return parts.length ? parts.join(" · ") : null;
}
