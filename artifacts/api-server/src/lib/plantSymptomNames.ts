import { HEAL_TARGET_KINDS, type SymptomsMap, type SymptomApplicationsMap } from "@workspace/db/schema";
import { canonicalSymptom } from "./symptomVocabulary";

/**
 * Brings a plant's stored symptom tags onto the fixed names of the
 * Beschwerden-Wortschatz (symptomVocabulary.ts): every tag is renamed, tags
 * that now mean the same complaint collapse into one, and the application
 * instructions move to the new name (distinct texts are joined). Pure.
 */
export function normalizePlantSymptoms(
  symptoms: SymptomsMap,
  applications: SymptomApplicationsMap,
): { symptoms: SymptomsMap; applications: SymptomApplicationsMap; changed: boolean } {
  const outSymptoms: SymptomsMap = {};
  const outApps: SymptomApplicationsMap = {};
  let changed = false;
  for (const target of HEAL_TARGET_KINDS) {
    const tags = symptoms[target];
    const apps = (applications[target] ?? {}) as Record<string, string>;
    if (tags !== undefined) {
      const names: string[] = [];
      for (const tag of tags) {
        const name = canonicalSymptom(tag);
        if (name !== tag) changed = true;
        if (names.includes(name)) {
          changed = true;
          continue;
        }
        names.push(name);
      }
      outSymptoms[target] = names;
    }
    if (applications[target] !== undefined) {
      const next: Record<string, string> = {};
      for (const [tag, text] of Object.entries(apps)) {
        const name = canonicalSymptom(tag);
        if (name !== tag) changed = true;
        const t = (text ?? "").trim();
        if (next[name] === undefined) next[name] = t;
        else if (t && !next[name].includes(t)) {
          next[name] = next[name] ? `${next[name]} ${t}` : t;
          changed = true;
        }
      }
      outApps[target] = next;
    }
  }
  return { symptoms: outSymptoms, applications: outApps, changed };
}
