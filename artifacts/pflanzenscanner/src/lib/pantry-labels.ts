import type { PantryKind } from "@workspace/api-client-react";

// Vorratskammer (docs/vorratskammer.md): labels, units and the usual keeping
// time per kind – the same suggestion as on the server (lib/pantry.ts).

export const PANTRY_KINDS: Record<PantryKind, { label: string; unit: string }> = {
  canned: { label: "Eingekocht", unit: "Glas" },
  frozen: { label: "Eingefroren", unit: "Beutel" },
  dried: { label: "Getrocknet", unit: "Glas" },
  pickled: { label: "Eingelegt", unit: "Glas" },
  fermented: { label: "Fermentiert", unit: "Glas" },
  juice: { label: "Saft", unit: "Flasche" },
  jam: { label: "Marmelade", unit: "Glas" },
  honey: { label: "Honig", unit: "Glas" },
  eggs: { label: "Eier", unit: "Stück" },
  other: { label: "Sonstiges", unit: "Stück" },
};

export const PANTRY_UNITS = ["Glas", "Beutel", "Dose", "Flasche", "Stück", "Portion", "kg", "g", "l"];

const KEEPS: Record<PantryKind, { months?: number; days?: number } | null> = {
  canned: { months: 12 },
  frozen: { months: 9 },
  dried: { months: 12 },
  pickled: { months: 12 },
  fermented: { months: 6 },
  juice: { months: 12 },
  jam: { months: 12 },
  honey: { months: 24 },
  eggs: { days: 28 },
  other: null,
};

/** A usual best-before date; empty when there is none to suggest. */
export function suggestBestBefore(kind: PantryKind, madeOn: string): string {
  const keep = KEEPS[kind];
  if (!keep || !/^\d{4}-\d{2}-\d{2}$/.test(madeOn)) return "";
  const d = new Date(`${madeOn}T12:00:00Z`);
  if (keep.days) {
    d.setUTCDate(d.getUTCDate() + keep.days);
    return d.toISOString().slice(0, 10);
  }
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + keep.months!);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

/** What fits a harvest: tomatoes are canned, berries frozen, herbs dried. */
export function kindForCrop(cropKey: string | null): PantryKind {
  if (!cropKey) return "canned";
  if (/erdbeere|himbeere|johannis|bohne|erbse|kirsche/.test(cropKey)) return "frozen";
  if (/basilikum|petersilie|schnittlauch|thymian|minze|oregano|salbei|ringelblume|kamille|dill/.test(cropKey)) return "dried";
  if (/gurke|zwiebel|rote_bete|kohl|weisskohl/.test(cropKey)) return "pickled";
  return "canned";
}
