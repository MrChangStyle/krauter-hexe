import type { Plant } from "@workspace/api-client-react";
import {
  hasHealingFor,
  isEdibleFor,
  symptomsFor,
  type HealTarget,
} from "@/lib/heal-targets";

// Pure filter logic for the Kräuter-Hexe page, extracted so it can be unit
// tested. The page composes these three steps:
//   1. relevantPlantsFor  – plants edible for OR healing for the target
//   2. availableSymptomsFor – de-duplicated symptom tags across those plants
//   3. filterByAilment    – narrow to plants matching the typed ailment and/or
//                           the selected symptoms (OR-combined)

export interface AilmentMatch {
  plant: Plant;
  matched: string[];
}

// Plants that are edible for OR have a Heilwirkung for the chosen target.
export function relevantPlantsFor(
  plants: readonly Plant[],
  target: HealTarget,
): Plant[] {
  return plants.filter((p) => isEdibleFor(p, target) || hasHealingFor(p, target));
}

// All symptom tags across the relevant plants for this target, de-duplicated
// case-insensitively, sorted alphabetically (de-DE).
//
// Tie-break: when the same symptom appears under multiple spellings (e.g.
// "Husten" and "husten"), the lexicographically smallest spelling wins.  This
// makes the canonical form independent of plant iteration order — a database
// reindex, backfill, or sort-order change cannot silently alter the canonical
// spelling that gets written into shared URLs.
export function availableSymptomsFor(
  relevantPlants: readonly Plant[],
  target: HealTarget,
): string[] {
  const byKey = new Map<string, string>();
  for (const plant of relevantPlants) {
    for (const tag of symptomsFor(plant, target)) {
      const key = tag.toLocaleLowerCase("de-DE");
      const existing = byKey.get(key);
      // Keep the lexicographically smallest spelling seen so far.
      if (existing === undefined || tag < existing) {
        byKey.set(key, tag);
      }
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, "de-DE"));
}

// Narrow to plants treating a matching Beschwerde: either the typed ailment
// (case-insensitive substring match against the symptom tags) OR any selected
// symptom (case-insensitive equality). With no query and no selection nothing
// is returned – the user names a Beschwerde first. Each result carries the
// specific symptom tags that made it match.
export function filterByAilment(
  relevantPlants: readonly Plant[],
  target: HealTarget,
  query: string,
  selected: ReadonlySet<string>,
): AilmentMatch[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("de-DE");
  const hasQuery = normalizedQuery.length > 0;
  const hasSelected = selected.size > 0;
  if (!hasQuery && !hasSelected) return [];

  const wanted = new Set(
    Array.from(selected).map((s) => s.toLocaleLowerCase("de-DE")),
  );
  const out: AilmentMatch[] = [];
  for (const p of relevantPlants) {
    const tags = symptomsFor(p, target);
    const matched = tags.filter((tag) => {
      const key = tag.toLocaleLowerCase("de-DE");
      return (
        (hasSelected && wanted.has(key)) ||
        (hasQuery && key.includes(normalizedQuery))
      );
    });
    if (matched.length > 0) out.push({ plant: p, matched });
  }
  return out;
}
