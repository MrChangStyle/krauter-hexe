/**
 * Weide – Schnitt und Parasiten (docs/weide.md): when a Mähweide or Wiese is
 * due for its next cut, whether the forecast gives hay weather, and when a
 * herd grazes where the same kind of animals stood not long ago, so worm
 * larvae from back then may still be in the grass. Fixed rules with guide
 * values (Richtwerte, listed under „Offen“ in the docs), no AI.
 */

import type { FarmSpecies, PastureKind } from '@workspace/db';

import { NAMES } from './farmAnimals';
import type { DayForecast } from './farmWeather';
import { addDays } from './feedSeason';

export interface Cut {
  id: number;
  pastureId: number;
  cutOn: string;
  bales: number | null;
  notes: string | null;
}

/** The parts of a grazing the rules look at. */
export interface CareGrazing {
  id: number;
  pastureId: number;
  label: string;
  species: FarmSpecies | null;
  startOn: string;
  endOn: string | null;
}

export interface CareHint {
  kind: 'mow' | 'parasite';
  pastureId: number;
  urgent: boolean;
  text: string;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const deDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

// ── Schnitt ──────────────────────────────────────────────────────────────────

interface MowRule {
  /** First cut of the year from (MM-DD). */
  first: string;
  /** Days of regrowth after a cut or a grazing. */
  every: number;
  /** No cut after this day (MM-DD) – the sward goes into winter. */
  last: string;
}

/**
 * Richtwerte: a Mähweide from mid-May (the main grasses heading), then about
 * every six weeks; a Wiese for hay from mid-June, then about every eight
 * weeks; nothing after September. Plain pastures and paddocks have no plan.
 */
export const MOW_RULES: Partial<Record<PastureKind, MowRule>> = {
  mowing: { first: '05-15', every: 42, last: '09-30' },
  meadow: { first: '06-15', every: 56, last: '09-30' },
};

/** Late by this many days, the cut is urgent (the grass gets woody). */
export const MOW_LATE_DAYS = 21;

export interface MowPlan {
  /** From when the next cut is due (next year's first after the season). */
  nextCutOn: string;
  cutsThisYear: number;
  lastCutOn: string | null;
}

/** The next cut for a Mähweide or Wiese; null for kinds without a plan. */
export function mowPlan(kind: PastureKind, pastureId: number, grazings: CareGrazing[], cuts: Cut[], today: string): MowPlan | null {
  const rule = MOW_RULES[kind];
  if (!rule) return null;
  const year = today.slice(0, 4);
  const mine = cuts.filter((c) => c.pastureId === pastureId && c.cutOn <= today).sort((a, b) => b.cutOn.localeCompare(a.cutOn));
  const thisYear = mine.filter((c) => c.cutOn.startsWith(year));
  // Regrowth starts after the last cut or the last grazing of the year.
  const lastGrazed = grazings
    .filter((g) => g.pastureId === pastureId && g.endOn !== null && g.endOn < today && g.endOn.startsWith(year))
    .map((g) => g.endOn!)
    .sort()
    .pop();
  const lastEvent = [thisYear[0]?.cutOn, lastGrazed].filter((d): d is string => !!d).sort().pop();
  const first = `${year}-${rule.first}`;
  let next = lastEvent ? addDays(lastEvent, rule.every) : first;
  if (next < first) next = first;
  // After the season (or a cut that would fall after it) the next is next year's first.
  const last = `${year}-${rule.last}`;
  if (next > last || today > last) next = `${Number(year) + 1}-${rule.first}`;
  return { nextCutOn: next, cutsThisYear: thisYear.length, lastCutOn: mine[0]?.cutOn ?? null };
}

/** Hay needs this many dry days in a row (Richtwert), below this much rain a day. */
export const HAY_DAYS = 3;
export const DRY_MM = 1;

/** The first run of dry days for hay in the forecast; undefined without a forecast. */
export function hayWeather(days: DayForecast[]): string | null | undefined {
  if (days.length === 0) return undefined;
  for (let i = 0; i + HAY_DAYS <= days.length; i++) {
    if (days.slice(i, i + HAY_DAYS).every((d) => d.precipitationMm < DRY_MM)) return days[i]!.date;
  }
  return null;
}

function mowHint(name: string, pastureId: number, plan: MowPlan, grazed: boolean, today: string, days: DayForecast[]): CareHint | null {
  if (grazed || plan.nextCutOn > today) return null;
  const late = daysBetween(plan.nextCutOn, today);
  const hay = hayWeather(days);
  const weather =
    hay === undefined
      ? ''
      : hay === null
        ? ` In den nächsten Tagen keine ${HAY_DAYS} trockenen Tage am Stück – fürs Heu abwarten, für Silage reicht ein trockener Tag.`
        : ` Heuwetter: ab ${hay === today ? 'heute' : deDay(hay)} ${HAY_DAYS} trockene Tage.`;
  return {
    kind: 'mow',
    pastureId,
    urgent: late >= MOW_LATE_DAYS,
    text: `${name}: ${plan.cutsThisYear + 1}. Schnitt fällig (Richtwert ab ${deDay(plan.nextCutOn)})${late >= MOW_LATE_DAYS ? ' – das Gras wird jetzt holzig' : ''}.${weather}`,
  };
}

// ── Parasiten ────────────────────────────────────────────────────────────────

type WormGroup = 'smallRuminant' | 'cattle' | 'horse' | 'pig' | 'poultry';

/**
 * Goats and sheep share their worms – and alpacas largely the same ones (Roter
 * Magenwurm), so they count as one group; the others mostly keep their own.
 */
const GROUP: Partial<Record<FarmSpecies, WormGroup>> = { goat: 'smallRuminant', sheep: 'smallRuminant', alpaca: 'smallRuminant', cattle: 'cattle', horse: 'horse', pig: 'pig', poultry: 'poultry' };

interface ParasiteRule {
  /** Richtwert: how long larvae or eggs from earlier grazing stay a risk. */
  days: number;
  worms: string;
  tip: string;
}

export const PARASITE_RULES: Record<WormGroup, ParasiteRule> = {
  smallRuminant: {
    days: 90,
    worms: 'Larven von Magen-Darm-Würmern (u. a. Roter Magenwurm)',
    tip: 'Kotprobe in 3–4 Wochen; besser Wechselweide mit Rindern oder Pferden, oder nach dem Abtreiben nachmähen.',
  },
  cattle: {
    days: 90,
    worms: 'Larven von Magen-Darm-Würmern und Lungenwurm',
    tip: 'Jungrinder im ersten Weidejahr besonders beobachten (Husten, Durchfall), Kotprobe; Wechselweide mit Schafen oder Pferden hilft.',
  },
  horse: {
    days: 60,
    worms: 'Larven kleiner Strongyliden',
    tip: 'Pferdeäpfel ein- bis zweimal die Woche absammeln, vor dem Entwurmen eine Kotprobe.',
  },
  pig: {
    days: 365,
    worms: 'Spulwurm-Eier (sie überdauern Jahre im Boden)',
    tip: 'Auslauf wechseln, Kotprobe, Liegeplätze trocken halten.',
  },
  poultry: {
    days: 90,
    worms: 'Spulwurm-Eier und Kokzidien',
    tip: 'Auslauf teilen und abwechselnd ruhen lassen, nasse Stellen trockenlegen, Kotprobe.',
  },
};

/** While a herd grazes: did the same kind of animals stand here not long before? */
export function parasiteHint(name: string, pastureId: number, current: CareGrazing | null, grazings: CareGrazing[]): CareHint | null {
  const group = current?.species ? GROUP[current.species] : undefined;
  if (!current || !group) return null;
  const rule = PARASITE_RULES[group];
  const before = grazings
    .filter((g) => g.pastureId === pastureId && g.id !== current.id && g.species && GROUP[g.species] === group && g.endOn !== null && g.endOn < current.startOn)
    .sort((a, b) => b.endOn!.localeCompare(a.endOn!))[0];
  if (!before || daysBetween(before.endOn!, current.startOn) > rule.days) return null;
  const plural = NAMES[before.species!].group;
  const who = before.label === current.label || before.label === plural ? before.label : `${plural} (${before.label})`;
  const season = group === 'smallRuminant' && ['07', '08', '09'].includes(current.startOn.slice(5, 7)) ? ' Im Spätsommer ist der Wurmdruck am höchsten.' : '';
  const latrines = current.species === 'alpaca' ? ' Alpakas koten auf feste Plätze – die Kothaufen ein- bis zweimal die Woche absammeln.' : '';
  return {
    kind: 'parasite',
    pastureId,
    urgent: false,
    text: `Auf ${name} standen ${who} schon bis ${deDay(before.endOn!)} – ${rule.worms} können noch im Gras sein. ${rule.tip}${season}${latrines}`,
  };
}

// ── Together ─────────────────────────────────────────────────────────────────

export function careHints(
  p: { id: number; name: string; kind: PastureKind },
  current: CareGrazing | null,
  grazings: CareGrazing[],
  cuts: Cut[],
  today: string,
  days: DayForecast[] = [],
): CareHint[] {
  const plan = mowPlan(p.kind, p.id, grazings, cuts, today);
  return [plan && mowHint(p.name, p.id, plan, current !== null, today, days), parasiteHint(p.name, p.id, current, grazings)].filter((h): h is CareHint => h !== null);
}

/** For the morning push: the day a cut comes due. */
export function mowPushLine(p: { id: number; name: string; kind: PastureKind }, grazed: boolean, grazings: CareGrazing[], cuts: Cut[], today: string): string | null {
  const plan = mowPlan(p.kind, p.id, grazings, cuts, today);
  return plan && !grazed && plan.nextCutOn === today ? `${p.name}: Schnitt fällig` : null;
}
