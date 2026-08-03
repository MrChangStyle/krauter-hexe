import type { Plant } from "@workspace/api-client-react";

/** First letter of germanName, upper-cased and normalised (Ä→A etc.). */
export function firstLetter(plant: Plant): string {
  return plant.germanName.charAt(0).toLocaleUpperCase("de");
}

/** Sorted, deduplicated list of letters present in a plant array. */
export function availableLetters(plants: Plant[]): string[] {
  const set = new Set(plants.map(firstLetter));
  return [...set].sort((a, b) => a.localeCompare(b, "de"));
}

/**
 * Apply letter filter + sort A-Z (stable-ish via germanName).
 * When no letter is chosen the original (chronological) order is preserved.
 */
export function applyAlpha(plants: Plant[], letter: string | null): Plant[] {
  const list = letter
    ? plants.filter((p) => firstLetter(p) === letter)
    : plants;
  if (!letter) return list;
  return [...list].sort((a, b) => a.germanName.localeCompare(b.germanName, "de"));
}
