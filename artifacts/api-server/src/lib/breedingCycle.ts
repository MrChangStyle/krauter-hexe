/**
 * Zucht – Brunstkalender und Absetzen (docs/zucht.md): a heat seen on a female
 * gives the next one from the species' cycle; a birth gives the day to wean
 * the young. Together with the running pregnancies this says for every female
 * whether she is pregnant, nursing, resting after a birth or open – and when
 * to watch for heat. Nothing is stored but the heats seen. Fixed rules, no AI;
 * the numbers are averages from the literature.
 */

import { breedingRecordsTable, db, farmAnimalsTable, heatRecordsTable, type FarmSpecies } from '@workspace/db';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { FarmDataError, notFound, text, validDate } from './farmAnimals';
import { addDays, daysBetween } from './feedSeason';
import { berlinDay } from './monitoring';

interface CycleRule {
  /** Average days from one heat to the next, and how long a heat lasts. */
  cycleDays: number;
  heatDays: number;
  /** Months (1–12) with heats; none: the whole year. */
  season?: number[];
  seasonText?: string;
  /** Earliest day after a birth to mate again – or, for sows, after weaning. */
  restDays: number;
  afterWeaning?: true;
  /** What a heat looks like. */
  signs: string;
}

export const CYCLES: Partial<Record<FarmSpecies, CycleRule>> = {
  goat: {
    cycleDays: 21,
    heatDays: 2,
    season: [8, 9, 10, 11, 12, 1, 2],
    seasonText: 'August bis Februar',
    restDays: 60,
    signs: 'Meckern, Schwanzwedeln, gerötete Scham, Unruhe, sucht den Bock.',
  },
  sheep: {
    cycleDays: 17,
    heatDays: 1,
    season: [8, 9, 10, 11, 12, 1],
    seasonText: 'August bis Januar',
    restDays: 60,
    signs: 'Unruhe, sucht die Nähe des Bocks, leicht gerötete Scham.',
  },
  pig: {
    cycleDays: 21,
    heatDays: 2,
    restDays: 5,
    afterWeaning: true,
    signs: 'Rauschen: Unruhe, gerötete, geschwollene Scham, Duldungsstarre beim Druck auf den Rücken.',
  },
  cattle: {
    cycleDays: 21,
    heatDays: 1,
    restDays: 60,
    signs: 'Bespringen und stehen lassen, Unruhe, klarer Schleimfaden, weniger Milch.',
  },
  horse: {
    cycleDays: 21,
    heatDays: 6,
    season: [4, 5, 6, 7, 8, 9],
    seasonText: 'April bis September',
    restDays: 7,
    signs: 'Rossig: häufiger Harnabsatz, „Blitzen“, sucht den Hengst, Schweif zur Seite.',
  },
  donkey: {
    cycleDays: 23,
    heatDays: 6,
    season: [3, 4, 5, 6, 7, 8, 9],
    seasonText: 'März bis September',
    restDays: 9,
    signs: 'Rossig: „Maulen“ (Kaubewegungen mit offenem Maul), häufiger Harnabsatz, sucht den Hengst.',
  },
  guineaPig: {
    cycleDays: 16,
    heatDays: 1,
    restDays: 0,
    signs: 'Kurz und unauffällig; direkt nach der Geburt wieder deckbereit – das Männchen vorher trennen.',
  },
  dog: {
    cycleDays: 180,
    heatDays: 21,
    restDays: 120,
    signs: 'Läufigkeit etwa alle sechs Monate; deckbereit meist um den 10. bis 14. Tag.',
  },
};

/** Days from birth to weaning – or to giving the young away – and what to do. */
export const WEANING: Partial<Record<FarmSpecies, [number, string]>> = {
  rabbit: [56, 'Jungtiere absetzen – frühestens mit acht Wochen.'],
  guineaPig: [21, 'Jungtiere absetzen; Böckchen spätestens mit vier Wochen von Mutter und Schwestern trennen.'],
  goat: [84, 'Kitze absetzen (etwa zwölf Wochen) – sie sollten Heu und Kraftfutter schon gut fressen.'],
  sheep: [84, 'Lämmer absetzen (etwa zwölf Wochen).'],
  pig: [35, 'Ferkel absetzen – nicht vor vier Wochen (Tierschutz-Nutztierhaltungsverordnung).'],
  cattle: [240, 'Kalb absetzen (Mutterkuhhaltung, etwa acht Monate).'],
  horse: [180, 'Fohlen absetzen (etwa sechs Monate) – am besten mit einem vertrauten Gefährten.'],
  donkey: [210, 'Eselfohlen absetzen (etwa sechs bis acht Monate) – nie allein, immer mit einem vertrauten Esel.'],
  alpaca: [180, 'Crias absetzen (etwa sechs Monate, Richtwert mindestens 25 kg) – Hengstfohlen dann von den Stuten trennen.'],
  cat: [84, 'Kätzchen frühestens mit zwölf Wochen abgeben.'],
  dog: [56, 'Welpen frühestens mit acht Wochen abgeben (Tierschutz-Hundeverordnung).'],
};

/** A weaning stays on the page this long after its day. */
const WEANING_SHOWN_DAYS = 14;
/** A heat older than this many cycles predicts nothing any more. */
const STALE_CYCLES = 3;

const month = (day: string) => Number(day.slice(5, 7));

/**
 * The next heat from the last one seen: the first cycle day that is not over
 * yet (a heat still going on counts). Null when the last one is too long ago
 * or the day falls outside the season.
 */
export function nextHeat(species: FarmSpecies, lastHeat: string, today: string): string | null {
  const rule = CYCLES[species];
  if (!rule) return null;
  const since = daysBetween(lastHeat, today);
  if (since > rule.cycleDays * STALE_CYCLES) return null;
  const cycles = Math.max(1, Math.ceil((since - (rule.heatDays - 1)) / rule.cycleDays));
  const next = addDays(lastHeat, cycles * rule.cycleDays);
  if (rule.season && !rule.season.includes(month(next))) return null;
  return next;
}

export type CycleStatus = 'pregnant' | 'nursing' | 'resting' | 'open';

export interface Birth {
  endedOn: string;
  alive: number;
}

/** Where a female stands: pregnant (due), nursing (until weaning), resting (until ready) or open. */
export function cycleState(
  species: FarmSpecies,
  input: { dueOn: string | null; lastBirth: Birth | null; lastHeat: string | null },
  today: string,
): { status: CycleStatus; until: string | null; nextHeat: string | null; inSeason: boolean } {
  const rule = CYCLES[species]!;
  const inSeason = !rule.season || rule.season.includes(month(today));
  if (input.dueOn) return { status: 'pregnant', until: input.dueOn, nextHeat: null, inSeason };
  let readyOn: string | null = null;
  let weanOn: string | null = null;
  if (input.lastBirth) {
    const wean = WEANING[species];
    weanOn = wean && input.lastBirth.alive > 0 ? addDays(input.lastBirth.endedOn, wean[0]) : null;
    readyOn = addDays(rule.afterWeaning && weanOn ? weanOn : input.lastBirth.endedOn, rule.restDays);
  }
  const next = input.lastHeat ? nextHeat(species, input.lastHeat, today) : null;
  if (weanOn && today < weanOn) return { status: 'nursing', until: weanOn, nextHeat: next, inSeason };
  if (readyOn && today < readyOn) return { status: 'resting', until: readyOn, nextHeat: next, inSeason };
  return { status: 'open', until: null, nextHeat: next, inSeason };
}

// ── For the app ───────────────────────────────────────────────────────────────

export interface CycleAnimal {
  id: number;
  name: string;
  species: FarmSpecies;
  status: CycleStatus;
  /** Due day (pregnant), weaning (nursing) or ready to mate (resting). */
  until: string | null;
  lastHeat: string | null;
  nextHeat: string | null;
  inSeason: boolean;
  season: string | null;
  signs: string;
  heats: { id: number; observedOn: string; notes: string | null }[];
}

export interface Weaning {
  recordId: number;
  species: FarmSpecies;
  motherName: string | null;
  bornOn: string;
  alive: number;
  weanOn: string;
  text: string;
}

export interface BreedingCycles {
  animals: CycleAnimal[];
  weanings: Weaning[];
}

export async function breedingCycles(farmId: number, today = berlinDay()): Promise<BreedingCycles> {
  const species = Object.keys(CYCLES) as FarmSpecies[];
  const [females, records] = await Promise.all([
    db
      .select({ id: farmAnimalsTable.id, name: farmAnimalsTable.name, species: farmAnimalsTable.species })
      .from(farmAnimalsTable)
      .where(and(eq(farmAnimalsTable.farmId, farmId), eq(farmAnimalsTable.sex, 'female'), isNull(farmAnimalsTable.archivedAt), inArray(farmAnimalsTable.species, species)))
      .orderBy(farmAnimalsTable.species, farmAnimalsTable.name),
    db.select().from(breedingRecordsTable).where(eq(breedingRecordsTable.farmId, farmId)).orderBy(desc(breedingRecordsTable.startedOn)),
  ]);
  const heats = females.length
    ? await db
        .select()
        .from(heatRecordsTable)
        .where(inArray(heatRecordsTable.animalId, females.map((f) => f.id)))
        .orderBy(desc(heatRecordsTable.observedOn), desc(heatRecordsTable.id))
    : [];

  const animals = females.map((f) => {
    const mine = records.filter((r) => r.motherId === f.id);
    const running = mine.find((r) => r.status === 'running');
    const born = mine.filter((r) => r.status === 'born' && r.endedOn).sort((a, b) => b.endedOn!.localeCompare(a.endedOn!))[0];
    const own = heats.filter((h) => h.animalId === f.id);
    const lastHeat = own[0]?.observedOn ?? null;
    const state = cycleState(
      f.species,
      { dueOn: running ? addDays(running.startedOn, running.durationDays) : null, lastBirth: born ? { endedOn: born.endedOn!, alive: born.bornAlive ?? 0 } : null, lastHeat },
      today,
    );
    const rule = CYCLES[f.species]!;
    return {
      id: f.id,
      name: f.name,
      species: f.species,
      ...state,
      lastHeat,
      season: rule.seasonText ?? null,
      signs: rule.signs,
      heats: own.slice(0, 5).map((h) => ({ id: h.id, observedOn: h.observedOn, notes: h.notes })),
    };
  });

  const names = new Map(
    (await db.select({ id: farmAnimalsTable.id, name: farmAnimalsTable.name }).from(farmAnimalsTable).where(eq(farmAnimalsTable.farmId, farmId))).map((a) => [a.id, a.name]),
  );
  const weanings = records
    .flatMap((r) => {
      const wean = WEANING[r.species];
      if (!wean || r.status !== 'born' || !r.endedOn || !r.bornAlive) return [];
      const weanOn = addDays(r.endedOn, wean[0]);
      if (daysBetween(weanOn, today) > WEANING_SHOWN_DAYS) return [];
      return [{ recordId: r.id, species: r.species, motherName: r.motherId ? (names.get(r.motherId) ?? null) : null, bornOn: r.endedOn, alive: r.bornAlive, weanOn, text: wean[1] }];
    })
    .sort((a, b) => a.weanOn.localeCompare(b.weanOn));
  return { animals, weanings };
}

export interface HeatInput {
  animalId: number;
  observedOn: unknown;
  notes?: unknown;
}

export async function addHeat(farmId: number, input: HeatInput, today = berlinDay()): Promise<BreedingCycles> {
  const [animal] = await db
    .select({ species: farmAnimalsTable.species, sex: farmAnimalsTable.sex, archivedAt: farmAnimalsTable.archivedAt, name: farmAnimalsTable.name })
    .from(farmAnimalsTable)
    .where(and(eq(farmAnimalsTable.id, input.animalId), eq(farmAnimalsTable.farmId, farmId)));
  if (!animal) throw new FarmDataError(400, 'Dieses Tier gibt es auf der Farm nicht.');
  if (!CYCLES[animal.species]) throw new FarmDataError(400, 'Für diese Tierart führt die App keinen Brunstkalender.');
  if (animal.sex !== 'female') throw new FarmDataError(400, `${animal.name} ist nicht als weiblich eingetragen.`);
  if (animal.archivedAt) throw new FarmDataError(400, `${animal.name} ist archiviert.`);
  const observedOn = validDate(input.observedOn, 'Datum');
  if (observedOn > today) throw new FarmDataError(400, 'Das Datum liegt in der Zukunft.');
  await db.insert(heatRecordsTable).values({ farmId, animalId: input.animalId, observedOn, notes: text(input.notes, 300, 'Die Notiz') });
  return breedingCycles(farmId, today);
}

export async function deleteHeat(farmId: number, heatId: number, today = berlinDay()): Promise<BreedingCycles> {
  const deleted = await db
    .delete(heatRecordsTable)
    .where(and(eq(heatRecordsTable.id, heatId), eq(heatRecordsTable.farmId, farmId)))
    .returning({ id: heatRecordsTable.id });
  if (deleted.length === 0) throw notFound();
  return breedingCycles(farmId, today);
}

/** Push lines for the morning: heats expected tomorrow (open females) and weanings due today. */
export function cycleLines(cycles: BreedingCycles, day: string): string[] {
  const tomorrow = addDays(day, 1);
  return [
    ...cycles.animals.filter((a) => a.status !== 'pregnant' && a.nextHeat === tomorrow).map((a) => `${a.name}: Brunst ab morgen erwartet – beobachten.`),
    ...cycles.weanings.filter((w) => w.weanOn === day).map((w) => `${w.motherName ?? 'Wurf'}: ${w.text}`),
  ];
}
