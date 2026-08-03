import type { Plant } from "@workspace/api-client-react";
import { getAnimalInfo, type AnimalKey } from "@/lib/animals";

// The targets the "Kräuter-Hexe" view can filter for: the human plus every
// animal, in display order (Mensch first). Each maps to either the human status
// columns or a per-animal fact sheet.
export type HealTarget = "human" | AnimalKey;

export const HEAL_TARGETS: ReadonlyArray<{ key: HealTarget; label: string }> = [
  { key: "human", label: "Mensch" },
  { key: "poultry", label: "Geflügel" },
  { key: "rabbit", label: "Hase" },
  { key: "guineaPig", label: "Meerschwein" },
  { key: "cat", label: "Katze" },
  { key: "horse", label: "Pferd" },
];

export function healTargetLabel(key: HealTarget): string {
  return HEAL_TARGETS.find((t) => t.key === key)?.label ?? key;
}

// The "no known medical effect" sentinel the AI writes into benefit fields.
// Treated as "no Heilwirkung" so it never counts as a healing plant.
const NO_BENEFIT_SENTINEL = "Keine bekannte medizinische Wirkung.";

// Whether a plant is edible/safe to feed to this target. Humans use the
// edibility status; animals use their per-animal safety status (with the legacy
// poultry fallback handled by getAnimalInfo).
export function isEdibleFor(plant: Plant, target: HealTarget): boolean {
  if (target === "human") return plant.humanStatus === "edible";
  return getAnimalInfo(plant, target)?.status === "safe";
}

// The raw benefit text for a target (human benefits vs. the per-animal fact
// sheet), or undefined when unknown for a legacy plant.
function benefitTextFor(plant: Plant, target: HealTarget): string | undefined {
  if (target === "human") return plant.humanBenefits;
  return getAnimalInfo(plant, target)?.benefits;
}

// Whether a plant has any documented Heilwirkung for this target. Based on the
// benefit text (non-empty and not the sentinel), so it works even before the
// symptom backfill has run - the symptom tags only drive the finer filter.
export function hasHealingFor(plant: Plant, target: HealTarget): boolean {
  const text = benefitTextFor(plant, target)?.trim();
  return !!text && text.length > 0 && text !== NO_BENEFIT_SENTINEL;
}

// Sentence-case normalisation: first character uppercased, rest lowercased.
// Applied before canonicalisation so every tag displayed in the UI has a
// consistent casing even if the stored data predates the write-time normaliser.
// Must stay in sync with toSentenceCase() in plantIdentification.ts.
function toSentenceCase(tag: string): string {
  if (tag.length === 0) return tag;
  return tag.charAt(0).toLocaleUpperCase("de-DE") + tag.slice(1).toLocaleLowerCase("de-DE");
}

// Canonical symptom name normalization. Applied both when reading stored tags
// (UI) and when the AI writes new ones (server-side). Must stay in sync with
// canonicalizeSymptomTag() in plantIdentification.ts on the API server.
export function canonicalizeSymptom(tag: string): string {
  // Sentence-case first so the keyword checks are case-independent and the
  // returned canonical strings always have consistent casing.
  const normalised = toSentenceCase(tag);
  const lower = normalised.toLocaleLowerCase("de-DE");
  if (lower.includes("wund")) return "Wunden";
  if (lower.includes("leber")) return "Leberbeschwerden";
  if (lower.includes("kreislauf")) return "Herz-Kreislauf-Erkrankungen";
  if (lower.includes("harnweg")) return "Harnwegsinfektion";
  if (lower.includes("atemweg")) return "Atemwegsbeschwerden";
  if (lower.includes("haut")) return "Hautprobleme";
  if (lower.includes("hals")) return "Halsbeschwerden";
  if (lower.includes("zahn")) return "Zahnprobleme";
  if (lower.includes("verdauung")) return "Verdauungsbeschwerden";
  return normalised;
}

// The treatable-symptom tags stored for this target, normalized and
// deduplicated. Multiple Zahn*/Verdauungs* variants collapse to one tag.
export function symptomsFor(plant: Plant, target: HealTarget): string[] {
  const raw = plant.symptoms?.[target] ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of raw) {
    const canonical = canonicalizeSymptom(tag);
    if (!seen.has(canonical)) {
      seen.add(canonical);
      result.push(canonical);
    }
  }
  return result;
}
