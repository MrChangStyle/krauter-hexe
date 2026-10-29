/**
 * Legeleistung als Verlauf (docs/legeleistung.md): eggs per hen and day week
 * by week, per group and – where entries name a hen – per hen, plus hints
 * by fixed rules (moult, winter, heat, a drop, old hens, young hens).
 *
 * Hens are poultry, female or unknown sex, of laying age (20 weeks) and not
 * archived before the week. The day an animal was entered does not count:
 * flocks are usually entered after the fact, with back-filled eggs.
 */

import { db, farmAnimalsTable, farmYieldsTable, herdsTable } from '@workspace/db';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';

import { addDays } from './feedSeason';
import { berlinDay } from './monitoring';
import { POULTRY_SPECIES } from './species';

export const LAYING_WEEKS = 26;
/** Hens start laying at about 20 weeks. */
export const LAYING_AGE_DAYS = 140;
const OLD_HEN_YEARS = 3;

export interface Hen {
  id: number;
  name: string;
  herdId: number | null;
  birthDate: string | null;
  archivedOn: string | null;
}

export interface EggEntry {
  date: string;
  amount: number;
  herdId: number | null;
  animalId: number | null;
}

export interface LayingWeek {
  start: string;
  days: number;
  eggs: number;
  hens: number;
  perHenDay: number | null;
}

export interface LayingGroup {
  herdId: number;
  name: string;
  hens: number;
  eggs: number;
  perHenDay: number | null;
}

export interface LayingHen {
  animalId: number;
  name: string;
  eggs: number;
  lastEgg: string | null;
}

export type LayingHintKind = 'moult' | 'winter' | 'heat' | 'drop' | 'quiet' | 'old' | 'young';

export interface LayingHint {
  kind: LayingHintKind;
  title: string;
  text: string;
}

export interface LayingHistory {
  weeks: LayingWeek[];
  groups: LayingGroup[];
  hens: LayingHen[];
  hints: LayingHint[];
}

const rate = (eggs: number, hens: number, days: number) => (hens > 0 && days > 0 ? Math.round((eggs / (hens * days)) * 100) / 100 : null);

/** Monday of the week the day falls in. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

/** Laying age reached and not yet gone on that day. */
export function laysOn(hen: Hen, day: string): boolean {
  if (hen.archivedOn !== null && hen.archivedOn < day) return false;
  return hen.birthDate === null || addDays(hen.birthDate, LAYING_AGE_DAYS) <= day;
}

function sumEggs(entries: EggEntry[], from: string, to: string): number {
  return entries.filter((e) => e.date >= from && e.date <= to).reduce((s, e) => s + e.amount, 0);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const MOULT: LayingHint = {
  kind: 'moult',
  title: 'Mauserzeit',
  text: 'Im Herbst wechseln Hennen ihr Gefieder und legen 6–12 Wochen wenig oder gar nicht. Das ist normal. Eiweißreiches Futter (Mauserfutter, Insekten, Ölsaaten) hilft beim Federwechsel.',
};
const WINTER: LayingHint = {
  kind: 'winter',
  title: 'Wintertief',
  text: 'Unter etwa 14 Stunden Tageslicht legen Hennen weniger. Das schont sie; ab Februar steigt die Legeleistung meist von selbst wieder.',
};
const HEAT: LayingHint = {
  kind: 'heat',
  title: 'Hitze',
  text: 'Ab etwa 28 °C legen Hennen weniger. Schatten, frisches kühles Wasser und Futter am kühlen Morgen helfen.',
};

/** Hints from fixed rules: season, a drop against the weeks before, the hens' age. */
export function layingHints(today: string, entries: EggEntry[], hens: Hen[]): LayingHint[] {
  const month = Number(today.slice(5, 7));
  const hints: LayingHint[] = [];
  const nowLaying = hens.filter((h) => laysOn(h, today)).length;

  const lastWeek = sumEggs(entries, addDays(today, -6), today);
  const before = sumEggs(entries, addDays(today, -34), addDays(today, -7));
  const recentRate = rate(sumEggs(entries, addDays(today, -13), today), nowLaying, 14);
  const beforeRate = rate(sumEggs(entries, addDays(today, -41), addDays(today, -14)), nowLaying, 28);

  if (lastWeek === 0 && before > 0) {
    hints.push({
      kind: 'quiet',
      title: 'Seit einer Woche keine Eier eingetragen',
      text: 'Nur vergessen einzutragen? Wenn die Hennen wirklich nicht legen: nach verlegten Nestern suchen, auf Milben prüfen (nachts am Sitzstangenende) und an Stress durch Raubtiere oder Umstallen denken.',
    });
  } else if (recentRate !== null && beforeRate !== null && beforeRate >= 0.2 && recentRate < beforeRate * 0.7) {
    const cause =
      month >= 8 && month <= 11
        ? 'Im Spätsommer und Herbst ist das meist die Mauser.'
        : month === 12 || month <= 1
          ? 'Im Winter liegt das meist am kurzen Tag.'
          : month >= 6 && month <= 8
            ? 'Im Sommer liegt das oft an Hitze.'
            : 'Zu dieser Jahreszeit ist das ungewöhnlich.';
    hints.push({
      kind: 'drop',
      title: `Legeleistung um ${Math.round((1 - recentRate / beforeRate) * 100)} % gesunken`,
      text: `Die letzten 2 Wochen ${String(recentRate).replace('.', ',')} Eier je Henne und Tag, die 4 Wochen davor ${String(beforeRate).replace('.', ',')}. ${cause} Sonst prüfen: Futter und Kalk, Wasser, Milben und Würmer, Stress, verlegte Eier.`,
    });
  }
  if (month >= 9 && month <= 11) hints.push(MOULT);
  else if (month === 12 || month <= 1) hints.push(WINTER);
  else if (month >= 6 && month <= 8) hints.push(HEAT);

  const oldBefore = addDays(today, -Math.round(OLD_HEN_YEARS * 365.25));
  const old = hens.filter((h) => laysOn(h, today) && h.birthDate !== null && h.birthDate <= oldBefore).length;
  if (old > 0) {
    hints.push({
      kind: 'old',
      title: old === 1 ? '1 Henne ist älter als 3 Jahre' : `${old} Hennen sind älter als 3 Jahre`,
      text: 'Ab dem dritten Jahr legen Hennen deutlich weniger. Das senkt den Durchschnitt, ohne dass etwas fehlt.',
    });
  }
  const young = hens.filter((h) => (h.archivedOn === null || h.archivedOn >= today) && h.birthDate !== null && !laysOn(h, today));
  if (young.length > 0) {
    const first = young.map((h) => addDays(h.birthDate!, LAYING_AGE_DAYS)).sort()[0]!;
    hints.push({
      kind: 'young',
      title: young.length === 1 ? '1 Junghenne' : `${young.length} Junghennen`,
      text: `Sie zählen noch nicht mit. Mit etwa 20 Wochen fangen sie an zu legen, die erste ab ${first.slice(8, 10)}.${first.slice(5, 7)}.${first.slice(0, 4)}.`,
    });
  }
  return hints;
}

export function layingHistory(
  today: string,
  hens: Hen[],
  entries: EggEntry[],
  herds: { id: number; name: string }[],
  weeks = LAYING_WEEKS,
): LayingHistory {
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  const series: LayingWeek[] = [];
  for (let start = first; start <= today; start = addDays(start, 7)) {
    const end = addDays(start, 6) < today ? addDays(start, 6) : today;
    const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
    // Hens of the week: those laying on its last counted day.
    const n = hens.filter((h) => laysOn(h, end)).length;
    const eggs = sumEggs(entries, start, end);
    series.push({ start, days, eggs: round1(eggs), hens: n, perHenDay: rate(eggs, n, days) });
  }

  const since = addDays(today, -29);
  const recent = entries.filter((e) => e.date >= since && e.date <= today);
  const herdOfHen = new Map(hens.map((h) => [h.id, h.herdId]));
  // With a single poultry group, eggs entered for the whole farm are that group's.
  const only = herds.length === 1 ? herds[0]!.id : null;
  const groupOf = (e: EggEntry) => e.herdId ?? (e.animalId !== null ? herdOfHen.get(e.animalId) : null) ?? only;
  const groups = herds.map((herd) => {
    const n = hens.filter((h) => h.herdId === herd.id && laysOn(h, today)).length;
    const eggs = recent.filter((e) => groupOf(e) === herd.id).reduce((s, e) => s + e.amount, 0);
    return { herdId: herd.id, name: herd.name, hens: n, eggs: round1(eggs), perHenDay: rate(eggs, n, 30) };
  });

  const perHen = hens
    .map((h) => {
      const own = recent.filter((e) => e.animalId === h.id);
      return { animalId: h.id, name: h.name, eggs: round1(own.reduce((s, e) => s + e.amount, 0)), lastEgg: own.map((e) => e.date).sort().at(-1) ?? null };
    })
    .filter((h) => h.lastEgg !== null)
    .sort((a, b) => b.eggs - a.eggs || a.name.localeCompare(b.name, 'de'));

  return { weeks: series, groups: groups.filter((g) => g.hens > 0 || g.eggs > 0), hens: perHen, hints: layingHints(today, entries, hens) };
}

// ── Database ──────────────────────────────────────────────────────────────────

export async function loadLayingHistory(farmId: number, today = berlinDay()): Promise<LayingHistory> {
  // Six weeks more than shown, for the drop hint.
  const from = addDays(weekStart(today), -7 * (LAYING_WEEKS + 6));
  const [animals, herds, eggs] = await Promise.all([
    db
      .select({
        id: farmAnimalsTable.id,
        name: farmAnimalsTable.name,
        herdId: farmAnimalsTable.herdId,
        birthDate: farmAnimalsTable.birthDate,
        archivedAt: farmAnimalsTable.archivedAt,
      })
      .from(farmAnimalsTable)
      .where(and(eq(farmAnimalsTable.farmId, farmId), inArray(farmAnimalsTable.species, [...POULTRY_SPECIES]), inArray(farmAnimalsTable.sex, ['female', 'unknown']))),
    db.select({ id: herdsTable.id, name: herdsTable.name }).from(herdsTable).where(and(eq(herdsTable.farmId, farmId), inArray(herdsTable.species, [...POULTRY_SPECIES]))).orderBy(herdsTable.name),
    db
      .select({ date: farmYieldsTable.date, amount: farmYieldsTable.amount, herdId: farmYieldsTable.herdId, animalId: farmYieldsTable.animalId })
      .from(farmYieldsTable)
      .where(and(eq(farmYieldsTable.farmId, farmId), eq(farmYieldsTable.product, 'eggs'), gte(farmYieldsTable.date, from), lte(farmYieldsTable.date, today))),
  ]);
  const hens: Hen[] = animals
    .map((a) => ({ id: a.id, name: a.name, herdId: a.herdId, birthDate: a.birthDate, archivedOn: a.archivedAt ? berlinDay(a.archivedAt) : null }))
    // Archived before the first week shown: never part of the chart.
    .filter((h) => h.archivedOn === null || h.archivedOn >= from);
  return layingHistory(today, hens, eggs, herds);
}
