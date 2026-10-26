import type { Plant } from "@workspace/api-client-react";
import { getAnimalInfo, type AnimalKey } from "@/lib/animals";
import { canonicalSymptom } from "@/lib/symptom-vocabulary";

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

// Canonical symptom name (lib/symptom-vocabulary.ts). Applied when reading
// stored tags, so older rows show the same wording as new ones; the server
// applies the same vocabulary when the AI writes new tags.
export function canonicalizeSymptom(tag: string): string {
  return canonicalSymptom(tag);
}

// The treatable-symptom tags stored for this target, normalized and
// deduplicated. Variants of one complaint ("Magenkrämpfe", "Verdauungs-
// beschwerden") collapse to one name.
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

// The application instructions for this target, keyed by the canonical
// symptom name. When several stored tags collapse into one name, their
// distinct instructions are joined.
export function applicationsFor(plant: Plant, target: HealTarget): Record<string, string> {
  const raw = (plant.symptomApplications as Record<string, Record<string, string>> | undefined)?.[target] ?? {};
  const out: Record<string, string> = {};
  for (const [tag, text] of Object.entries(raw)) {
    const t = text?.trim();
    if (!t) continue;
    const key = canonicalSymptom(tag);
    if (!out[key]) out[key] = t;
    else if (!out[key].includes(t)) out[key] = `${out[key]} ${t}`;
  }
  return out;
}
