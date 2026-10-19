import type { Seed, SeedSaving, SeedSource } from "@workspace/api-client-react";

export const SEED_STATUS: Record<Seed["status"], { label: string; tone: string }> = {
  ok: { label: "Keimt gut", tone: "bg-emerald-600 text-white" },
  check: { label: "Keimprobe empfohlen", tone: "bg-amber-400 text-amber-950" },
  old: { label: "Zu alt?", tone: "bg-red-600 text-white" },
  weak: { label: "Keimt schlecht", tone: "bg-red-600 text-white" },
  empty: { label: "Aufgebraucht", tone: "bg-muted text-muted-foreground" },
  archived: { label: "Archiviert", tone: "bg-muted text-muted-foreground" },
};

export const SOURCE_LABELS: Record<SeedSource, string> = {
  bought: "Gekauft",
  saved: "Selbst gewonnen",
  swapped: "Getauscht",
};

export const SAVING_TEXT: Record<SeedSaving, string> = {
  easy: "Selbstbefruchter: Samen von den schönsten Pflanzen nehmen – bei samenfesten Sorten kommt die Sorte wieder.",
  isolate: "Kreuzt sich mit anderen Sorten der Art: nur eine Sorte blühen lassen oder weit auseinander pflanzen.",
  biennial: "Blüht erst im zweiten Jahr: ein paar Pflanzen überwintern lassen und im Jahr darauf Samen ernten.",
  vegetative: "Wird über Knollen, Zehen, Ausläufer oder Teilung vermehrt, nicht über Samen.",
};

/** "Ernte 2025 · gut bis 2028" / "Keimprobe 10.10.2026: 85 %" – what the status is based on. */
export function seedBasis(s: Pick<Seed, "harvestYear" | "useBy" | "goodUntil" | "germinationRate" | "testedOn">): string {
  const parts: string[] = [];
  if (s.harvestYear) parts.push(`Ernte ${s.harvestYear}`);
  if (s.useBy) parts.push(`verwendbar bis ${s.useBy.split("-").reverse().join(".")}`);
  // A test says more than the estimate from the age.
  if (s.goodUntil && !s.useBy && s.germinationRate === null) parts.push(`keimt gut bis etwa ${s.goodUntil}`);
  if (!s.harvestYear && !s.useBy) parts.push("Alter unbekannt");
  if (s.germinationRate !== null && s.testedOn) parts.push(`Keimprobe ${s.testedOn.split("-").reverse().join(".")}: ${Math.round(s.germinationRate * 100)} %`);
  return parts.join(" · ");
}

/** "2 Tüten", "30 g", "1 Tüte" */
export function amountText(amount: number, unit: string): string {
  const n = amount.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  return unit === "Tüten" && amount === 1 ? "1 Tüte" : `${n} ${unit}`;
}
