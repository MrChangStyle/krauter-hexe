/**
 * Groups of species that share rules (docs/gefluegel.md). "poultry" is the
 * chicken; geese, ducks, turkeys and quails are poultry too – eggs, brood,
 * avian flu and the stock register apply to all of them.
 */

import type { FarmSpecies } from '@workspace/db';

export const POULTRY_SPECIES: readonly FarmSpecies[] = ['poultry', 'goose', 'duck', 'turkey', 'quail'];

export function isPoultry(species: FarmSpecies): boolean {
  return POULTRY_SPECIES.includes(species);
}

/** Geese and ducks: they need water to bathe in. */
export const WATERFOWL: readonly FarmSpecies[] = ['goose', 'duck'];
