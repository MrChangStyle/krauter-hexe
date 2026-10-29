/**
 * Fütterungsplan (Futterplaner step 3, docs/futterplaner.md): which ration is
 * in effect today (all year, summer or winter), the step-by-step change from
 * one ration to another, and the fixed hints of the season. Pure rules – no
 * database, no weather service.
 */

import type { FarmSpecies } from '@workspace/db';

import type { FeedCategory } from './feedCatalog';
import { isPoultry } from './species';

export const SEASONS = ['all', 'summer', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

/** Summer = April to October (green feed, pasture), winter = November to March. */
export function seasonOf(dayKey: string): Exclude<Season, 'all'> {
  const month = Number(dayKey.slice(5, 7));
  return month >= 4 && month <= 10 ? 'summer' : 'winter';
}

/** The first day of the next season (YYYY-MM-DD) after `dayKey`. */
export function nextSeasonStart(dayKey: string): { season: Exclude<Season, 'all'>; day: string } {
  const year = Number(dayKey.slice(0, 4));
  const month = Number(dayKey.slice(5, 7));
  if (month >= 4 && month <= 10) return { season: 'winter', day: `${year}-11-01` };
  return { season: 'summer', day: `${month >= 11 ? year + 1 : year}-04-01` };
}

/** The ration in effect: the one for the current season, else the all-year one. */
export function activeSeason(seasons: readonly Season[], dayKey: string): Season | null {
  const now = seasonOf(dayKey);
  if (seasons.includes(now)) return now;
  return seasons.includes('all') ? 'all' : null;
}

/**
 * Days for a change of feed: the gut flora of ruminants, horses and rabbits
 * needs about two weeks, poultry and pigs about one.
 */
const TRANSITION_DAYS: Record<FarmSpecies, number> = {
  goat: 14,
  sheep: 14,
  cattle: 14,
  alpaca: 14,
  goose: 7,
  duck: 7,
  turkey: 7,
  quail: 7,
  rhea: 14,
  donkey: 14,
  horse: 14,
  rabbit: 10,
  guineaPig: 10,
  poultry: 7,
  pig: 7,
  cat: 7,
  dog: 7,
  other: 10,
};

export function transitionDays(species: FarmSpecies): number {
  return TRANSITION_DAYS[species];
}

export function addDays(dayKey: string, days: number): string {
  const d = new Date(`${dayKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** Share of the new ration on day `index` (0-based) of `days`: four steps of 25 %. */
export function newShareOn(index: number, days: number): number {
  return Math.min(4, Math.floor((index * 4) / days) + 1) / 4;
}

export interface Phase {
  fromDay: number;
  toDay: number;
  newShare: number;
}

export function phases(days: number): Phase[] {
  const out: Phase[] = [];
  for (let d = 0; d < days; d++) {
    const share = newShareOn(d, days);
    const last = out[out.length - 1];
    if (last && last.newShare === share) last.toDay = d + 1;
    else out.push({ fromDay: d + 1, toDay: d + 1, newShare: share });
  }
  return out;
}

export interface MixItem<K> {
  key: K;
  grams: number;
}

const roundGrams = (g: number) => (g >= 100 ? Math.round(g / 5) * 5 : Math.round(g));

/** Today's mixture: old and new ration blended by the share of the new one. */
export function mix<K>(oldItems: MixItem<K>[], newItems: MixItem<K>[], share: number, same: (a: K, b: K) => boolean): MixItem<K>[] {
  const out: MixItem<K>[] = [];
  for (const n of newItems) {
    const o = oldItems.find((x) => same(x.key, n.key));
    out.push({ key: n.key, grams: roundGrams((o?.grams ?? 0) * (1 - share) + n.grams * share) });
  }
  for (const o of oldItems) {
    if (!newItems.some((n) => same(n.key, o.key))) out.push({ key: o.key, grams: roundGrams(o.grams * (1 - share)) });
  }
  return out.filter((i) => i.grams > 0);
}

const GRAZERS: FarmSpecies[] = ['rabbit', 'guineaPig', 'goat', 'sheep', 'horse', 'cattle', 'alpaca', 'goose', 'rhea', 'donkey'];

/** Fixed hints for the season of a ration in effect. */
export function seasonHints(species: FarmSpecies, dayKey: string, categories: readonly FeedCategory[]): string[] {
  if (species === 'cat' || species === 'dog') return [];
  const season = seasonOf(dayKey);
  const fresh = categories.includes('fresh');
  const hints: string[] = [];
  if (season === 'winter') {
    if (fresh && GRAZERS.includes(species)) {
      hints.push('Frisches Gras und Wildkräuter gibt es im Winter kaum – Heu und Lagerfutter (Rüben, Möhren) einplanen.');
    }
    hints.push(
      isPoultry(species)
        ? 'Bei Frost: Wasser mehrmals am Tag frostfrei anbieten; abends etwas Körner geben – sie liefern Energie für die Nacht.'
        : 'Bei Frost: Wasser mehrmals am Tag frostfrei anbieten; Raufutter um 10–20 % erhöhen – die Verdauung von Heu wärmt.',
    );
  } else if (GRAZERS.includes(species)) {
    if (fresh) {
      hints.push(
        species === 'horse' || species === 'donkey'
          ? 'Weidegang im Frühjahr langsam steigern (erst 15 Minuten, dann täglich mehr) – junges Gras kann Hufrehe auslösen.'
          : `Grünfutter langsam anfüttern, über etwa ${transitionDays(species)} Tage – zu schneller Wechsel führt zu Blähungen und Durchfall.`,
      );
    } else if (Number(dayKey.slice(5, 7)) <= 9) {
      // Not in October: the winter is close, a summer ration no longer pays off.
      hints.push('Im Sommer ist Grünfutter oder Weide möglich – eine Sommerration anlegen und langsam umstellen.');
    }
  }
  return hints;
}
