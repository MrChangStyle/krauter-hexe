import type { FarmSpecies } from "@workspace/api-client-react";

/**
 * Platz-Check auf Bio-Höfen (docs/bio.md, B4): stall floor and outdoor run per
 * animal against the minimum areas of the EU organic rules (VO (EU) 2020/464,
 * Anhang I). Richtwerte for a typical adult animal – to be checked by the
 * advisor or the control body; Verbände are often stricter.
 */
export interface SpaceRule {
  /** Which kind of animal the values are for. */
  basis: string;
  /** At most so many animals per m² of stall … */
  perM2Stall?: number;
  /** … or at least so many m² of stall per animal. */
  m2StallPerAnimal?: number;
  /** At least so many m² of outdoor run per animal. */
  m2RunPerAnimal: number;
}

export const SPACE_RULES: Partial<Record<FarmSpecies, SpaceRule>> = {
  poultry: { basis: "Legehennen", perM2Stall: 6, m2RunPerAnimal: 4 },
  turkey: { basis: "Puten", perM2Stall: 10, m2RunPerAnimal: 10 },
  duck: { basis: "Enten", perM2Stall: 10, m2RunPerAnimal: 4.5 },
  goose: { basis: "Gänse", perM2Stall: 10, m2RunPerAnimal: 15 },
  pig: { basis: "Mastschweine bis 110 kg", m2StallPerAnimal: 1.3, m2RunPerAnimal: 1 },
  cattle: { basis: "Milchkühe", m2StallPerAnimal: 6, m2RunPerAnimal: 4.5 },
  sheep: { basis: "Schafe", m2StallPerAnimal: 1.5, m2RunPerAnimal: 2.5 },
  goat: { basis: "Ziegen", m2StallPerAnimal: 1.5, m2RunPerAnimal: 2.5 },
};

export interface SpaceCheck {
  rule: SpaceRule;
  /** Stall: least area needed for the group, m² (null without a stall entry). */
  stallNeeded: number;
  stallOk: boolean | null;
  runNeeded: number;
  runOk: boolean | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The check of a group, or null when there are no values for the species or no animals. */
export function spaceCheck(species: FarmSpecies, animals: number, stallM2: number | null, runM2: number | null): SpaceCheck | null {
  const rule = SPACE_RULES[species];
  if (!rule || animals <= 0) return null;
  const stallNeeded = r1(rule.perM2Stall ? animals / rule.perM2Stall : animals * (rule.m2StallPerAnimal ?? 0));
  const runNeeded = r1(animals * rule.m2RunPerAnimal);
  return {
    rule,
    stallNeeded,
    stallOk: stallM2 == null ? null : stallM2 >= stallNeeded,
    runNeeded,
    runOk: runM2 == null ? null : runM2 >= runNeeded,
  };
}
