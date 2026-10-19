/**
 * Garten-Assistent (Beet-Architekt step 6): goals of a farm → what its people
 * and animals need from the garden → how the beds are split between kitchen
 * and fodder. Fixed rules of thumb, no AI; the AI only comes in when the user
 * lets it fill a bed (the Beet-Vorschlag of step 5, with these wishes).
 */

import {
  GARDEN_DIRECTIONS,
  db,
  farmAnimalsTable,
  gardenBedsTable,
  gardenGoalsTable,
  type FarmSpecies,
  type GardenDirection,
} from '@workspace/db';
import { and, asc, count, eq, isNull } from 'drizzle-orm';

import { FarmDataError } from './farmAnimals';
import { cropByKey } from './gardenCatalog';
import { latestYields, type Yields } from './gardenHarvests';

export interface GardenGoals {
  people: number;
  animalShare: number;
  directions: GardenDirection[];
  hoursPerWeek: number | null;
}

export const DEFAULT_GOALS: GardenGoals = { people: 2, animalShare: 0, directions: ['vegetables', 'herbs'], hoursPerWeek: null };

// ── Rules of thumb ───────────────────────────────────────────────────────────

/** Bed area per person and year (m²) for each direction. */
export const KITCHEN_M2: Record<GardenDirection, number> = { vegetables: 40, storage: 20, herbs: 2, fruit: 5 };

const KITCHEN_CROPS: Record<GardenDirection, string[]> = {
  vegetables: ['tomate', 'buschbohne', 'salat', 'zucchini', 'gurke', 'kohlrabi', 'radieschen', 'spinat'],
  storage: ['kartoffel', 'moehre', 'zwiebel', 'rote_bete', 'pastinake', 'kuerbis', 'knoblauch'],
  herbs: ['petersilie', 'schnittlauch', 'basilikum', 'dill', 'thymian', 'salbei'],
  fruit: ['erdbeere', 'rhabarber'],
};

/**
 * Fresh greens from the garden per animal and day (kg) – a supplement next to
 * hay, pasture and feed. Horses, cattle, cats and dogs get none from the bed.
 */
export const FODDER_KG_PER_DAY: Record<FarmSpecies, number> = {
  rabbit: 0.25,
  guineaPig: 0.15,
  poultry: 0.03,
  goat: 1,
  sheep: 1,
  pig: 0.5,
  horse: 0,
  cattle: 0,
  cat: 0,
  dog: 0,
  other: 0,
};

/** Garden crops that suit each species as fodder (no toxic ones). */
const FODDER_CROPS: Record<FarmSpecies, string[]> = {
  rabbit: ['moehre', 'mangold', 'petersilie', 'fenchel', 'salat', 'pastinake', 'dill'],
  guineaPig: ['moehre', 'mangold', 'petersilie', 'fenchel', 'salat', 'pastinake', 'dill'],
  poultry: ['mangold', 'salat', 'spinat', 'kuerbis', 'zucchini', 'ringelblume'],
  goat: ['mangold', 'rote_bete', 'moehre', 'kuerbis', 'pastinake'],
  sheep: ['mangold', 'rote_bete', 'moehre', 'kuerbis', 'pastinake'],
  pig: ['kuerbis', 'rote_bete', 'moehre', 'zucchini', 'mangold'],
  horse: [],
  cattle: [],
  cat: [],
  dog: [],
  other: [],
};

const SPECIES_DE: Record<FarmSpecies, string> = {
  poultry: 'Geflügel',
  rabbit: 'Kaninchen',
  guineaPig: 'Meerschweinchen',
  cat: 'Katzen',
  horse: 'Pferde',
  dog: 'Hunde',
  goat: 'Ziegen',
  sheep: 'Schafe',
  cattle: 'Rinder',
  pig: 'Schweine',
  other: 'sonstige Tiere',
};

/** Days of the garden season for fresh greens, and of winter from storage. */
const SEASON_DAYS = 180;
const WINTER_DAYS = 150;
/** Yield per m² and season (kg): leafy greens, and roots for winter. */
const GREENS_KG_M2 = 3;
/** Typical kitchen harvest per m² behind the kitchen areas above. */
const KITCHEN_KG_M2 = 3;
const ROOTS_KG_M2 = 4;
/** Hours per week a 10 m² bed takes in the season (sowing, weeding, watering). */
const M2_PER_WEEKLY_HOUR = 10;

const round = (n: number, step = 1) => Math.round(n * (1 / step)) / (1 / step);

export interface AnimalCount {
  species: FarmSpecies;
  count: number;
}

export interface BedArea {
  id: number;
  name: string;
  lengthCm: number;
  widthCm: number;
}

export interface GardenPlan {
  goals: GardenGoals;
  kitchenNeedM2: number;
  fodder: {
    animals: { species: FarmSpecies; count: number; perDayKg: number }[];
    perDayKg: number;
    summerKg: number;
    winterKg: number;
    needM2: number;
  };
  availableM2: number;
  kitchenM2: number;
  fodderM2: number;
  kitchenCoverage: number | null;
  fodderCoverage: number | null;
  manageableM2: number | null;
  /** Own yields the plan was computed with (latest season with harvests). */
  learned: { season: number; kitchenKgPerM2: number | null; fodderKgPerM2: number | null } | null;
  beds: { bedId: number; name: string; areaM2: number; role: 'kitchen' | 'fodder'; crops: string[]; wishes: string }[];
  tips: string[];
}

const names = (keys: string[]) => keys.flatMap((k) => (cropByKey(k) ? [cropByKey(k)!.name] : []));

/** The plan from goals, animals and beds – pure, so it can be tested as is. */
export function planGarden(goals: GardenGoals, animals: AnimalCount[], beds: BedArea[], yields: Yields | null = null): GardenPlan {
  // Own harvests replace the rules of thumb – within sensible bounds.
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const kitchenFactor = yields?.kitchenKgPerM2 ? clamp(KITCHEN_KG_M2 / yields.kitchenKgPerM2, 0.5, 2) : 1;
  const greensKgM2 = yields?.fodderKgPerM2 ? clamp(yields.fodderKgPerM2, 0.5, 15) : GREENS_KG_M2;
  const kitchenNeedM2 = round(goals.people * goals.directions.reduce((s, d) => s + KITCHEN_M2[d], 0) * kitchenFactor);
  const fed = animals
    .filter((a) => a.count > 0)
    .map((a) => ({ ...a, perDayKg: round(a.count * FODDER_KG_PER_DAY[a.species], 0.01) }));
  const perDayKg = round(fed.reduce((s, a) => s + a.perDayKg, 0), 0.01);
  const summerKg = round(perDayKg * SEASON_DAYS);
  const winterKg = round(perDayKg * 0.5 * WINTER_DAYS);
  const fodderNeedM2 = round(summerKg / greensKgM2 + winterKg / ROOTS_KG_M2);

  const areas = beds.map((b) => ({ ...b, areaM2: round((b.lengthCm * b.widthCm) / 10_000, 0.1) }));
  const availableM2 = round(areas.reduce((s, b) => s + b.areaM2, 0), 0.1);

  // Whole beds go to fodder, biggest first, until the wanted share is reached.
  const fodderTarget = fodderNeedM2 > 0 ? Math.min(fodderNeedM2, (availableM2 * goals.animalShare) / 100) : 0;
  const fodderIds = new Set<number>();
  let fodderM2 = 0;
  const bySize = [...areas].sort((a, z) => z.areaM2 - a.areaM2);
  for (const b of bySize) {
    if (fodderM2 >= fodderTarget) break;
    if (fodderM2 + b.areaM2 <= fodderTarget * 1.25) {
      fodderIds.add(b.id);
      fodderM2 += b.areaM2;
    }
  }
  // Every bed is bigger than the share: the smallest one becomes the fodder bed.
  if (fodderTarget > 0 && fodderIds.size === 0 && bySize.length > 1) {
    const smallest = bySize.at(-1)!;
    fodderIds.add(smallest.id);
    fodderM2 = smallest.areaM2;
  }
  fodderM2 = round(fodderM2, 0.1);
  const kitchenM2 = round(availableM2 - fodderM2, 0.1);

  const kitchenCrops = [...new Set(goals.directions.flatMap((d) => KITCHEN_CROPS[d]))];
  const fodderCrops = [...new Set(fed.filter((a) => a.perDayKg > 0).flatMap((a) => FODDER_CROPS[a.species]))];
  const eaters = fed.filter((a) => FODDER_KG_PER_DAY[a.species] > 0).map((a) => SPECIES_DE[a.species]);
  const plannedBeds = areas.map((b) => {
    const fodder = fodderIds.has(b.id);
    const crops = fodder ? fodderCrops : kitchenCrops;
    return {
      bedId: b.id,
      name: b.name,
      areaM2: b.areaM2,
      role: fodder ? ('fodder' as const) : ('kitchen' as const),
      crops,
      wishes: fodder
        ? `Tierfutter für ${eaters.join(' und ')}: ${names(crops).join(', ')}`
        : `Für die Küche: ${names(crops).join(', ')}`,
    };
  });

  const pct = (have: number, need: number) => (need > 0 ? Math.min(100, Math.round((have / need) * 100)) : null);
  const manageableM2 = goals.hoursPerWeek === null ? null : goals.hoursPerWeek * M2_PER_WEEKLY_HOUR;
  const tips: string[] = [];
  const learned = yields && (yields.kitchenKgPerM2 || yields.fodderKgPerM2) ? yields : null;
  if (learned) {
    const parts = [
      learned.kitchenKgPerM2 ? `Küche ${learned.kitchenKgPerM2.toLocaleString('de-DE')} kg/m² (Faustwert ${KITCHEN_KG_M2})` : null,
      learned.fodderKgPerM2 ? `Tierfutter ${learned.fodderKgPerM2.toLocaleString('de-DE')} kg/m² (Faustwert ${GREENS_KG_M2})` : null,
    ].filter(Boolean);
    tips.push(`Gerechnet mit euren Ernten ${learned.season}: ${parts.join(', ')}.`);
    const best = learned.crops.find((c) => c.m2 >= 0.27);
    if (best) tips.push(`Am meisten pro m² brachte ${best.label}: ${best.kgPerM2.toLocaleString('de-DE')} kg/m².`);
  }
  if (beds.length === 0) tips.push('Leg zuerst deine Beete an – dann teilt der Assistent sie auf.');
  const totalNeed = kitchenNeedM2 + (goals.animalShare > 0 ? fodderNeedM2 : 0);
  if (beds.length > 0 && availableM2 < totalNeed) {
    tips.push(`Deine Beete (${availableM2.toLocaleString('de-DE')} m²) reichen für einen Teil des Bedarfs – für alles bräuchtest du etwa ${totalNeed} m².`);
  }
  if (manageableM2 !== null && availableM2 > manageableM2) {
    tips.push(
      `Für ${availableM2.toLocaleString('de-DE')} m² rechnet man in der Saison etwa ${Math.ceil(availableM2 / M2_PER_WEEKLY_HOUR)} Stunden pro Woche. Mulchen, Hochbeete und Dauerkulturen sparen Zeit.`,
    );
  }
  if (goals.animalShare > 0 && fodderNeedM2 === 0) {
    tips.push(fed.length > 0 ? 'Deine Tiere brauchen kein Grünfutter aus dem Beet.' : 'Im Tier-Modul sind noch keine Tiere eingetragen.');
  }
  if (winterKg > 0 && goals.animalShare > 0) {
    tips.push(`Für den Winter etwa ${winterKg} kg Lagerfutter einplanen (Möhren, Rote Bete, Pastinaken) – kühl und dunkel lagern.`);
  }
  const noGreens = fed.filter((a) => FODDER_KG_PER_DAY[a.species] === 0).map((a) => SPECIES_DE[a.species]);
  if (noGreens.length > 0 && goals.animalShare > 0) tips.push(`${noGreens.join(', ')}: Futter kommt von Weide, Heu oder aus dem Napf, nicht aus dem Beet.`);

  return {
    goals,
    kitchenNeedM2,
    fodder: { animals: fed, perDayKg, summerKg, winterKg, needM2: fodderNeedM2 },
    availableM2,
    kitchenM2,
    fodderM2,
    kitchenCoverage: pct(kitchenM2, kitchenNeedM2),
    fodderCoverage: goals.animalShare > 0 ? pct(fodderM2, fodderNeedM2) : null,
    manageableM2,
    learned: learned ? { season: learned.season, kitchenKgPerM2: learned.kitchenKgPerM2, fodderKgPerM2: learned.fodderKgPerM2 } : null,
    beds: plannedBeds,
    tips,
  };
}

// ── Database ─────────────────────────────────────────────────────────────────

export async function getGoals(farmId: number): Promise<GardenGoals> {
  const [row] = await db.select().from(gardenGoalsTable).where(eq(gardenGoalsTable.farmId, farmId));
  if (!row) return DEFAULT_GOALS;
  return { people: row.people, animalShare: row.animalShare, directions: row.directions, hoursPerWeek: row.hoursPerWeek };
}

export async function saveGoals(farmId: number, input: GardenGoals): Promise<GardenGoals> {
  const people = Number(input.people);
  const animalShare = Number(input.animalShare);
  const hours = input.hoursPerWeek === null || input.hoursPerWeek === undefined ? null : Number(input.hoursPerWeek);
  if (!Number.isInteger(people) || people < 0 || people > 30) throw new FarmDataError(400, 'Bitte gib 0 bis 30 Personen an.');
  if (!Number.isInteger(animalShare) || animalShare < 0 || animalShare > 100) throw new FarmDataError(400, 'Der Tierfutter-Anteil liegt zwischen 0 und 100 %.');
  if (hours !== null && (!Number.isInteger(hours) || hours < 0 || hours > 80)) throw new FarmDataError(400, 'Bitte gib 0 bis 80 Stunden pro Woche an.');
  const directions = GARDEN_DIRECTIONS.filter((d) => input.directions.includes(d));
  const goals = { people, animalShare, directions, hoursPerWeek: hours };
  await db
    .insert(gardenGoalsTable)
    .values({ farmId, ...goals })
    .onConflictDoUpdate({ target: gardenGoalsTable.farmId, set: { ...goals, updatedAt: new Date() } });
  return goals;
}

export async function gardenPlan(farmId: number): Promise<GardenPlan> {
  const goals = await getGoals(farmId);
  const animals = await db
    .select({ species: farmAnimalsTable.species, count: count() })
    .from(farmAnimalsTable)
    .where(and(eq(farmAnimalsTable.farmId, farmId), isNull(farmAnimalsTable.archivedAt)))
    .groupBy(farmAnimalsTable.species);
  const beds = await db
    .select({ id: gardenBedsTable.id, name: gardenBedsTable.name, lengthCm: gardenBedsTable.lengthCm, widthCm: gardenBedsTable.widthCm })
    .from(gardenBedsTable)
    .where(eq(gardenBedsTable.farmId, farmId))
    .orderBy(asc(gardenBedsTable.name), asc(gardenBedsTable.id));
  return planGarden(goals, animals, beds, await latestYields(farmId, new Date().getFullYear()));
}
