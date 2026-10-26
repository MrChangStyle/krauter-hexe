import type { BreedingRecord, CycleAnimal, FarmAnimal, FarmSpecies } from "@workspace/api-client-react";
import { deDay } from "@/lib/medicine-labels";

/** Average length per species (as on the server, lib/breeding.ts) – for the form's preview. */
export const BREEDING_DAYS: Partial<Record<FarmSpecies, number>> = {
  poultry: 21,
  rabbit: 31,
  guineaPig: 68,
  goat: 150,
  sheep: 147,
  pig: 115,
  cattle: 283,
  horse: 335,
  alpaca: 345,
  cat: 63,
  dog: 63,
};

/** Incubation by bird (poultry is one species in the app). */
export const BIRDS: { label: string; days: number }[] = [
  { label: "Huhn", days: 21 },
  { label: "Pute", days: 28 },
  { label: "Ente", days: 28 },
  { label: "Moschusente (Flugente)", days: 35 },
  { label: "Gans", days: 30 },
  { label: "Wachtel", days: 17 },
];

/** Animals that can be the mother / father of a record of this species. */
export function parentChoices(animals: FarmAnimal[], species: FarmSpecies, role: "mother" | "father"): FarmAnimal[] {
  const wrong = role === "mother" ? ["male", "neutered"] : ["female", "neutered"];
  return animals.filter((a) => a.species === species && !a.archivedAt && !wrong.includes(a.sex));
}

export function breedingTitle(r: Pick<BreedingRecord, "motherName" | "eggCount" | "kind">): string {
  if (r.motherName) return r.motherName;
  return r.kind === "incubation" ? `Brut mit ${r.eggCount} Eiern` : "Ohne Muttertier";
}

/** 0…1 of the way to the expected day. */
export function progress(r: Pick<BreedingRecord, "day" | "durationDays">): number {
  return r.day === null ? 1 : Math.min(1, Math.max(0, r.day / r.durationDays));
}

/** "Geboren am 28.09.2026: 2 lebend, 1 tot" / "Abgebrochen am …" / null while running. */
export function outcomeText(r: Pick<BreedingRecord, "status" | "kind" | "endedOn" | "bornAlive" | "bornDead">): string | null {
  if (r.status === "running" || !r.endedOn) return null;
  if (r.status === "failed") return `Nicht trächtig oder abgebrochen (${deDay(r.endedOn)})`;
  const what = r.kind === "incubation" ? "Geschlüpft" : "Geboren";
  return `${what} am ${deDay(r.endedOn)}: ${r.bornAlive ?? 0} lebend${r.bornDead ? `, ${r.bornDead} tot` : ""}`;
}

/** "heute", "morgen", "in 5 Tagen", "seit 3 Tagen" – how far a day is from today. */
export function relDay(day: string, today: string): string {
  const diff = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (diff === 0) return "heute";
  if (diff === 1) return "morgen";
  if (diff === -1) return "gestern";
  return diff > 0 ? `in ${diff} Tagen` : `vor ${-diff} Tagen`;
}

/** The status line of a female in the Brunstkalender. */
export function cycleStatusText(a: Pick<CycleAnimal, "status" | "until">): string {
  switch (a.status) {
    case "pregnant":
      return `Tragend – Geburt um den ${deDay(a.until!)}`;
    case "nursing":
      return `Säugt – Absetzen am ${deDay(a.until!)}`;
    case "resting":
      return `Pause nach der Geburt – wieder decken ab ${deDay(a.until!)}`;
    default:
      return "Deckbereit";
  }
}

/** When to watch for the next heat, or why the app cannot say. */
export function nextHeatText(a: Pick<CycleAnimal, "status" | "lastHeat" | "nextHeat" | "inSeason" | "season">, today: string): string | null {
  if (a.status === "pregnant") return null;
  if (a.nextHeat === today) return "Brunst heute erwartet";
  if (a.nextHeat) return `Nächste Brunst um den ${deDay(a.nextHeat)} (${relDay(a.nextHeat, today)})`;
  if (!a.inSeason && a.season) return `Außerhalb der Brunstsaison (${a.season})`;
  if (a.lastHeat) return "Letzte Brunst zu lange her – die nächste bitte eintragen.";
  return "Noch keine Brunst eingetragen.";
}
