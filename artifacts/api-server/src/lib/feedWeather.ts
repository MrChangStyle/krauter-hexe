/**
 * Wetter im Futterplaner (docs/futterplaner.md): when the forecast drops below
 * what an animal copes with on its usual ration (its lower critical
 * temperature), it needs more energy – about 1 % per degree below, from the
 * feed that warms it: hay for the grazers and rabbits, grain or compound feed
 * for poultry and pigs. Fixed rules, guide values for animals with winter coat
 * or plumage and a dry, draught-free shelter.
 */

import type { FarmSpecies } from '@workspace/db';

import type { FeedCategory } from './feedCatalog';
import type { DayForecast } from './farmWeather';

interface ColdRule {
  /** Lower critical temperature in °C (winter coat, dry shelter). */
  limit: number;
  /** Which feeds to give more of, and how they are called in the hint. */
  feeds: FeedCategory[];
  what: string;
}

export const COLD_RULES: Partial<Record<FarmSpecies, ColdRule>> = {
  horse: { limit: -10, feeds: ['roughage'], what: 'Heu' },
  cattle: { limit: -10, feeds: ['roughage'], what: 'Heu' },
  sheep: { limit: -10, feeds: ['roughage'], what: 'Heu' },
  goat: { limit: 0, feeds: ['roughage'], what: 'Heu' },
  // Dense fleece: cold is no problem, wet and wind are – a dry shelter counts.
  alpaca: { limit: -10, feeds: ['roughage'], what: 'Heu' },
  rabbit: { limit: 0, feeds: ['roughage'], what: 'Heu' },
  pig: { limit: 5, feeds: ['compound', 'grain'], what: 'Kraftfutter' },
  poultry: { limit: 5, feeds: ['compound', 'grain'], what: 'Körner und Legefutter' },
};

/** More than this is no longer a matter of the ration – the shelter needs help. */
export const MAX_COLD_PERCENT = 25;
/** How many days ahead the ration looks. */
const COLD_DAYS = 3;

export interface ColdBoost {
  date: string;
  minTemp: number;
  percent: number;
  /** Per animal and day: the extra of each feed that warms. */
  extra: { name: string; grams: number }[];
  text: string;
}

const temp = (t: number) => `${t < 0 ? '−' : ''}${Math.abs(t).toLocaleString('de-DE')} °C`;
const gramsText = (g: number) => (g >= 1000 ? `${(Math.round(g / 100) / 10).toLocaleString('de-DE')} kg` : `${Math.round(g)} g`);

/**
 * The extra feed for the coldest of the next three days, or null when it stays
 * above the species' limit (or the ration has nothing that warms).
 */
export function coldBoost(species: FarmSpecies, items: { name: string; grams: number; category: FeedCategory }[], days: DayForecast[]): ColdBoost | null {
  const rule = COLD_RULES[species];
  const next = days.slice(0, COLD_DAYS);
  if (!rule || next.length === 0) return null;
  const coldest = next.reduce((a, b) => (b.minTemp < a.minTemp ? b : a));
  const below = rule.limit - coldest.minTemp;
  if (below < 1) return null;
  const percent = Math.min(MAX_COLD_PERCENT, Math.round(below));
  const extra = items
    .filter((i) => rule.feeds.includes(i.category) && i.grams > 0)
    .map((i) => ({ name: i.name, grams: Math.round((i.grams * percent) / 100) }))
    .filter((i) => i.grams > 0);
  const amounts = extra.length ? `: ${extra.map((e) => `+${gramsText(e.grams)} ${e.name}`).join(', ')} je Tier und Tag` : ` – die Ration enthält kein ${rule.what}, bitte ergänzen`;
  const shelter = percent >= MAX_COLD_PERCENT ? ' So kalt hilft vor allem ein trockener, zugfreier Stall mit dicker Einstreu.' : '';
  return {
    date: coldest.date,
    minTemp: coldest.minTemp,
    percent,
    extra,
    text: `Kälte bis ${temp(coldest.minTemp)}: etwa ${percent} % mehr ${rule.what}${amounts}.${shelter}`,
  };
}
