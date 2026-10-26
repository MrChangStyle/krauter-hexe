/**
 * Bedarf je Art und Lebensphase, and the fixed rules that compare a ration
 * with it (Futterplaner, docs/futterplaner.md). No AI.
 *
 * Values for a typical animal of the species, on dry matter: daily dry matter
 * intake, ranges for crude protein and crude fibre (% DM), calcium and
 * phosphorus (g/kg DM), copper maximum where it matters (sheep), water per
 * day. Richtwerte after the usual recommendations (GfE, DLG, keeping guides) –
 * to be checked by a specialist before the public start.
 */

import type { FarmSpecies } from '@workspace/db';

import type { FeedValues } from './feedCatalog';

export const LIFE_STAGES = ['maintenance', 'growth', 'laying', 'molt', 'pregnancy', 'lactation', 'winter'] as const;
export type LifeStage = (typeof LIFE_STAGES)[number];

type Range = [min: number, max: number];

export interface Need {
  /** Typical body weight the values are for (kg). */
  weightKg: number;
  dmIntakeKg: number;
  crudeProtein: Range;
  crudeFibre: Range;
  calcium: Range;
  phosphorus: Range;
  /** mg/kg DM – only where too much is dangerous (sheep). */
  copperMax: number | null;
  waterL: number;
}

const n = (weightKg: number, dmIntakeKg: number, cp: Range, fibre: Range, ca: Range, p: Range, waterL: number, copperMax: number | null = null): Need => ({
  weightKg,
  dmIntakeKg,
  crudeProtein: cp,
  crudeFibre: fibre,
  calcium: ca,
  phosphorus: p,
  copperMax,
  waterL,
});

/** Needs per species and stage; species without an entry get no ration check. */
export const FEED_NEEDS: Partial<Record<FarmSpecies, Partial<Record<LifeStage, Need>>>> = {
  poultry: {
    laying: n(2, 0.105, [17, 21], [3, 8], [36, 48], [4, 7], 0.25),
    molt: n(2, 0.09, [19, 23], [3, 8], [10, 25], [4, 7], 0.25),
    growth: n(1, 0.06, [18, 23], [3, 6], [9, 13], [6, 8], 0.15),
    maintenance: n(2, 0.09, [14, 18], [3, 8], [9, 15], [4, 7], 0.2),
    winter: n(2, 0.105, [15, 19], [3, 8], [9, 40], [4, 7], 0.2),
  },
  rabbit: {
    maintenance: n(3, 0.12, [12, 16], [18, 30], [4, 10], [3, 6], 0.3),
    growth: n(2, 0.12, [15, 18], [14, 20], [4, 8], [3, 6], 0.25),
    pregnancy: n(3.5, 0.15, [15, 18], [14, 20], [8, 12], [4, 7], 0.4),
    lactation: n(3.5, 0.25, [17, 19], [12, 18], [10, 13], [5, 8], 0.8),
    winter: n(3, 0.14, [12, 16], [18, 30], [4, 10], [3, 6], 0.3),
  },
  guineaPig: {
    maintenance: n(1, 0.05, [14, 18], [15, 28], [5, 10], [3, 6], 0.1),
    pregnancy: n(1.2, 0.07, [18, 20], [10, 16], [8, 12], [4, 7], 0.15),
    growth: n(0.6, 0.04, [18, 20], [10, 16], [6, 10], [4, 7], 0.08),
  },
  goat: {
    maintenance: n(60, 1.8, [8, 12], [18, 30], [3, 6], [2, 4], 4),
    pregnancy: n(65, 2, [10, 14], [16, 28], [4, 7], [2.5, 4], 5),
    lactation: n(60, 2.5, [13, 17], [16, 25], [5, 8], [3, 5], 8),
    growth: n(25, 0.9, [13, 16], [15, 25], [4, 7], [2.5, 4], 2),
    winter: n(60, 2, [8, 12], [18, 30], [3, 6], [2, 4], 4),
  },
  sheep: {
    maintenance: n(70, 1.5, [8, 11], [18, 30], [3, 6], [2, 4], 4, 15),
    pregnancy: n(75, 1.8, [10, 13], [16, 28], [3.5, 6], [2.5, 4], 5, 15),
    lactation: n(70, 2.4, [13, 16], [16, 25], [4, 7], [3, 5], 7, 15),
    growth: n(30, 1.1, [13, 16], [15, 25], [4, 7], [2.5, 4], 2, 15),
    winter: n(70, 1.7, [8, 11], [18, 30], [3, 6], [2, 4], 4, 15),
  },
  horse: {
    maintenance: n(500, 10, [7, 10], [18, 35], [2.5, 6], [1.7, 4], 30),
    pregnancy: n(550, 10, [9, 12], [18, 35], [4, 7], [3, 5], 35),
    lactation: n(500, 12.5, [11, 14], [16, 30], [5, 8], [3, 5], 50),
    winter: n(500, 11, [7, 10], [18, 35], [2.5, 6], [1.7, 4], 30),
  },
  cattle: {
    maintenance: n(650, 12, [9, 12], [18, 30], [3, 6], [2.5, 4], 50),
    lactation: n(650, 18, [14, 17], [16, 25], [6, 8], [3.5, 4.5], 100),
    pregnancy: n(700, 13, [10, 13], [18, 30], [4, 7], [3, 4.5], 60),
    growth: n(250, 6, [13, 16], [16, 25], [5, 8], [3, 5], 25),
  },
  // Alpakas (docs/alpaka.md): about 1.5–2 % of body weight as dry matter,
  // mostly hay and grass; much fibre, little protein when not breeding.
  alpaca: {
    maintenance: n(65, 1.2, [8, 12], [25, 40], [3, 6], [2, 4], 4),
    pregnancy: n(70, 1.4, [10, 13], [22, 38], [4, 7], [2.5, 4], 5),
    lactation: n(65, 1.7, [12, 15], [20, 35], [4, 7], [3, 5], 7),
    growth: n(30, 0.8, [13, 16], [20, 35], [4, 7], [2.5, 4], 2),
    winter: n(65, 1.4, [8, 12], [25, 40], [3, 6], [2, 4], 4),
  },
  pig: {
    maintenance: n(200, 2.5, [12, 15], [5, 10], [7, 10], [5, 7], 10),
    growth: n(60, 2.2, [15, 19], [3, 8], [6, 9], [5, 7], 8),
    pregnancy: n(220, 2.7, [12, 15], [6, 10], [7, 10], [5, 7], 15),
    lactation: n(220, 6, [16, 19], [3, 7], [8, 10], [5.5, 7], 30),
  },
};

export function needFor(species: FarmSpecies, stage: LifeStage): Need | null {
  return FEED_NEEDS[species]?.[stage] ?? null;
}

// ── Ration check ─────────────────────────────────────────────────────────────

export type Nutrient = 'amount' | 'crudeProtein' | 'crudeFibre' | 'calcium' | 'phosphorus' | 'copper';
export type Light = 'ok' | 'low' | 'high';

export interface NutrientCheck {
  nutrient: Nutrient;
  value: number;
  min: number;
  max: number;
  status: Light;
  /** Far off (red), not just a little (yellow). */
  severe: boolean;
  tip: string | null;
}

export interface RationItemValues extends FeedValues {
  grams: number;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Dry matter (kg) and nutrients per kg DM of a day's ration of one animal. */
export function rationValues(items: RationItemValues[]) {
  const dm = items.map((i) => (i.grams / 1000) * (i.dryMatter / 100));
  const dmKg = dm.reduce((s, v) => s + v, 0);
  const avg = (pick: (i: RationItemValues) => number) => (dmKg > 0 ? items.reduce((s, i, k) => s + dm[k]! * pick(i), 0) / dmKg : 0);
  const withCopper = items.filter((i) => i.copper !== null);
  const copperKnown = withCopper.length === items.length;
  return {
    dmKg: Math.round(dmKg * 1000) / 1000,
    crudeProtein: r1(avg((i) => i.crudeProtein)),
    crudeFat: r1(avg((i) => i.crudeFat)),
    crudeFibre: r1(avg((i) => i.crudeFibre)),
    calcium: r1(avg((i) => i.calcium)),
    phosphorus: r1(avg((i) => i.phosphorus)),
    copper: copperKnown ? r1(avg((i) => i.copper ?? 0)) : null,
  };
}

/** Ways to even out a gap – fixed hints, species first, then general. */
const TIPS: Partial<Record<FarmSpecies | '*', Partial<Record<`${Nutrient}:${'low' | 'high'}`, string>>>> = {
  poultry: {
    'calcium:low': 'Muschelkalk oder Austernschalen zur freien Aufnahme anbieten.',
    'calcium:high': 'Außerhalb der Legezeit kein Legehennenfutter mit viel Calcium – Junghennen- oder Erhaltungsfutter nehmen.',
    'crudeProtein:low': 'Mehr Alleinfutter, weniger Körner (Körner höchstens ein Drittel der Ration).',
    'crudeFibre:high': 'Weniger Gras und Heu im Futtertrog; Grünes als Beschäftigung reicht.',
    'amount:low': 'Futter zur freien Aufnahme anbieten – Hühner fressen nach Bedarf.',
  },
  rabbit: {
    'crudeFibre:low': 'Mehr Heu zur freien Aufnahme, weniger Pellets und Getreide.',
    'crudeProtein:high': 'Pellets reduzieren, Heu und Grünfutter erhöhen.',
    'calcium:high': 'Weniger Luzerne und Pellets – zu viel Calcium belastet Nieren und Blase.',
  },
  guineaPig: {
    'crudeFibre:low': 'Mehr Heu zur freien Aufnahme, Pellets sparsam.',
    'calcium:high': 'Weniger Luzerne und calciumreiches Grün (Petersilie) – Blasensteine drohen.',
  },
  sheep: {
    'copper:high': 'Kupfer ist für Schafe giftig: nur kupferarmes Schaf-Mineralfutter, kein Rinder- oder Ziegenfutter.',
  },
  goat: { 'crudeFibre:low': 'Mehr Heu oder Stroh – Wiederkäuer brauchen Rohfaser.' },
  horse: { 'crudeFibre:low': 'Mehr Heu (etwa 1,5 kg je 100 kg Körpergewicht), weniger Kraftfutter.' },
  alpaca: {
    'crudeFibre:low': 'Mehr Heu (gern zweiter Schnitt) zur freien Aufnahme, Kraftfutter nur sparsam – Alpakas verfetten schnell.',
    'crudeProtein:high': 'Kraftfutter und Luzerne verringern – Alpakas brauchen außerhalb von Trächtigkeit und Säugezeit wenig Eiweiß.',
    'calcium:low': 'Mineralfutter für Alpakas/Lamas ergänzen, kein Schaf- oder Rindermineral.',
  },
  '*': {
    'amount:low': 'Die Ration reicht nicht – mehr Grundfutter (Heu) geben.',
    'amount:high': 'Die Ration ist größer als nötig – Kraftfutter verringern, Grundfutter bleibt.',
    'crudeProtein:low': 'Eiweißreicheres Futter ergänzen (z. B. Luzerne, Fertigfutter der Art).',
    'crudeProtein:high': 'Weniger Kraftfutter, mehr Heu.',
    'crudeFibre:low': 'Mehr Heu oder Stroh.',
    'crudeFibre:high': 'Etwas energiereicheres Futter ergänzen.',
    'calcium:low': 'Mineralfutter für diese Art ergänzen.',
    'calcium:high': 'Calciumreiches Futter (Luzerne, Mineralfutter) verringern.',
    'phosphorus:low': 'Mineralfutter für diese Art ergänzen.',
    'phosphorus:high': 'Weniger Getreide und Kleie.',
  },
};

function tip(species: FarmSpecies, nutrient: Nutrient, status: Light): string | null {
  if (status === 'ok') return null;
  const key = `${nutrient}:${status}` as const;
  return TIPS[species]?.[key] ?? TIPS['*']?.[key] ?? null;
}

function check(species: FarmSpecies, nutrient: Nutrient, value: number, [min, max]: Range): NutrientCheck {
  const status: Light = value < min ? 'low' : value > max ? 'high' : 'ok';
  const severe = status === 'low' ? value < min * 0.85 : status === 'high' ? value > max * 1.2 : false;
  return { nutrient, value, min, max, status, severe, tip: tip(species, nutrient, status) };
}

/** The Ampel of one animal's daily ration against its need. */
export function checkRation(species: FarmSpecies, need: Need, items: RationItemValues[]): { values: ReturnType<typeof rationValues>; checks: NutrientCheck[] } {
  const values = rationValues(items);
  const amount = check(species, 'amount', values.dmKg, [need.dmIntakeKg * 0.9, need.dmIntakeKg * 1.3]);
  // Amount: red below three quarters, yellow below 90 %.
  amount.severe = amount.status === 'low' ? values.dmKg < need.dmIntakeKg * 0.75 : amount.severe;
  const checks = [
    amount,
    check(species, 'crudeProtein', values.crudeProtein, need.crudeProtein),
    check(species, 'crudeFibre', values.crudeFibre, need.crudeFibre),
    check(species, 'calcium', values.calcium, need.calcium),
    check(species, 'phosphorus', values.phosphorus, need.phosphorus),
  ];
  if (need.copperMax !== null && values.copper !== null) {
    // Too much copper poisons sheep – any amount over the limit is red.
    const copper = check(species, 'copper', values.copper, [0, need.copperMax]);
    copper.severe = copper.status === 'high';
    checks.push(copper);
  }
  return { values, checks };
}
