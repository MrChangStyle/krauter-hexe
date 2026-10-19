import type { BreedingRecord, FarmAnimal, FarmSpecies } from "@workspace/api-client-react";
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
