import type { AnimalInfo, Plant } from "@workspace/api-client-react";

// The animals shown in the "Status Tiere" dropdown, in display order. "poultry"
// stays first because it mirrors the legacy poultry columns and is always
// available (even before the per-animal backfill has run).
// The same kinds as ANIMAL_KINDS in lib/db (schema/plants.ts).
export type AnimalKey =
  | "poultry"
  | "rabbit"
  | "guineaPig"
  | "cat"
  | "horse"
  | "dog"
  | "goat"
  | "sheep"
  | "cattle"
  | "pig"
  | "alpaca"
  | "donkey";

export const ANIMALS: ReadonlyArray<{ key: AnimalKey; label: string }> = [
  { key: "poultry", label: "Geflügel" },
  { key: "rabbit", label: "Hase" },
  { key: "guineaPig", label: "Meerschweinchen" },
  { key: "cat", label: "Katze" },
  { key: "horse", label: "Pferd" },
  { key: "dog", label: "Hund" },
  { key: "goat", label: "Ziege" },
  { key: "sheep", label: "Schaf" },
  { key: "cattle", label: "Rind" },
  { key: "pig", label: "Schwein" },
  { key: "alpaca", label: "Alpaka" },
  { key: "donkey", label: "Esel" },
];

export function animalLabel(key: AnimalKey): string {
  return ANIMALS.find((a) => a.key === key)?.label ?? key;
}

// Returns the per-animal fact sheet for a plant. Falls back to the legacy
// poultry columns for the "poultry" entry so plants scanned before this feature
// existed still show something until the backfill fills the new field. Returns
// undefined for the other animals on legacy plants (the UI hides those until
// backfilled).
export function getAnimalInfo(
  plant: Plant,
  key: AnimalKey,
): AnimalInfo | undefined {
  const info = plant.animals?.[key];
  if (info) return info;
  // Until the backfill has filled the donkey, the horse stands in: donkeys eat
  // like horses (same rule on the server, lib/farmAi.ts).
  if (key === "donkey" && plant.animals?.horse) return plant.animals.horse;
  if (key === "poultry") {
    return {
      status: plant.poultryStatus,
      toxicityDetails: plant.animalToxicityDetails,
      benefits: plant.poultryBenefits,
    };
  }
  return undefined;
}
