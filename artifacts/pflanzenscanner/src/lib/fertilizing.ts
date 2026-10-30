import type { FarmSpecies, FertilizerKind, Herd } from "@workspace/api-client-react";

/** Düngung (docs/bio.md, B7): the kinds as the app names them. */
export const FERTILIZER_LABELS: Record<FertilizerKind, string> = {
  compost: "Kompost",
  manure_own: "Mist aus dem eigenen Stall",
  manure_bought: "Mist zugekauft",
  green_manure: "Gründüngung",
  horn: "Hornspäne / Hornmehl",
  plant_tea: "Pflanzenjauche",
  organic_bought: "Organischer Handelsdünger",
  mineral: "Mineraldünger (Kunstdünger)",
  other: "Sonstiges",
};

export const FERTILIZER_ORDER = Object.keys(FERTILIZER_LABELS) as FertilizerKind[];

/**
 * Mist im Jahr je Tier, kg Festmist mit Einstreu – grobe Richtwerte für die
 * Kreislauf-Rechnung Stall → Beet, keine Düngeplanung. Arten ohne Wert zählen nicht.
 */
export const MANURE_KG_PER_YEAR: Partial<Record<FarmSpecies, number>> = {
  poultry: 60,
  duck: 70,
  goose: 100,
  turkey: 100,
  quail: 5,
  rabbit: 150,
  guineaPig: 20,
  goat: 1200,
  sheep: 1000,
  alpaca: 600,
  pig: 1500,
  donkey: 4000,
  horse: 9000,
  cattle: 12000,
};

/** Gut verrotteter Mist für Starkzehrer, kg je m² und Jahr (Richtwert). */
export const MANURE_KG_PER_M2 = 3;

/** How much manure the farm's groups give a year, and for how many m² of bed it is enough. */
export function manureEstimate(herds: readonly Pick<Herd, "species" | "animalCount">[]): { kg: number; m2: number } | null {
  const kg = herds.reduce((sum, h) => sum + (MANURE_KG_PER_YEAR[h.species] ?? 0) * h.animalCount, 0);
  if (kg <= 0) return null;
  return { kg: Math.round(kg / 10) * 10, m2: Math.round(kg / MANURE_KG_PER_M2) };
}
