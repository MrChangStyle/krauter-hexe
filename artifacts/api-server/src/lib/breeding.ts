/**
 * Zucht ("Meine Farm"): matings and clutches of eggs from the day of mating or
 * setting to the birth or hatch. The expected day, its range and the steps on
 * the way (candling, nest box, drying off, farrowing pen, …) are computed from
 * fixed rules per species – nothing is stored but the start and the length.
 * Parents are kept on the animals (`mother_id`, `father_id`), which gives the
 * lineage on the animal page and a warning when related animals are mated.
 * Fixed rules, no AI; the numbers are averages (docs/zucht.md).
 */

import { breedingRecordsTable, db, farmAnimalsTable, farmMembershipsTable, farmPushLogTable, heatRecordsTable, type FarmSpecies } from '@workspace/db';
import { grantedSql } from './farmModules';
import { and, asc, desc, eq, inArray, lt, or } from 'drizzle-orm';

import { breedingCycles, cycleLines } from './breedingCycle';
import { FarmDataError, freeNumbers, notFound, text, validDate } from './farmAnimals';
import { addDays, daysBetween } from './feedSeason';
import { logger } from './logger';
import { berlinDay } from './monitoring';
import { sendPushToUser } from './webPush';

export type BreedingKind = 'pregnancy' | 'incubation';

interface SpeciesRule {
  kind: BreedingKind;
  /** Average length in days, and how far a normal birth or hatch lies before / after it. */
  days: number;
  early: number;
  late: number;
  /** Steps: a positive day counts from the start, a negative one back from the expected day. */
  steps: [number, string][];
  /** The young, for the animals created at birth ("Kitz 1"). */
  young: string;
  prefix: string;
}

const REMATING = 'Auf erneute Brunst achten – zeigt sie sich, ist das Tier nicht tragend.';

export const BREEDING: Partial<Record<FarmSpecies, SpeciesRule>> = {
  poultry: {
    kind: 'incubation',
    days: 21,
    early: 1,
    late: 1,
    steps: [
      [7, 'Schieren: unbefruchtete und abgestorbene Eier aussortieren.'],
      [-7, 'Zweites Schieren.'],
      [-3, 'Nicht mehr wenden und die Luftfeuchte erhöhen – Schlupfruhe.'],
    ],
    young: 'Küken',
    prefix: 'KÜ',
  },
  rabbit: {
    kind: 'pregnancy',
    days: 31,
    early: 3,
    late: 4,
    steps: [
      [12, 'Abtasten: ist die Häsin trächtig?'],
      [-5, 'Nestbox mit Heu und Stroh in den Stall stellen.'],
    ],
    young: 'Jungtier',
    prefix: 'KJ',
  },
  guineaPig: {
    kind: 'pregnancy',
    days: 68,
    early: 9,
    late: 4,
    steps: [
      [-14, 'Männchen spätestens jetzt trennen – sonst deckt es sie direkt nach der Geburt wieder.'],
      [-7, 'Nicht mehr hochheben, für Ruhe und reichlich Vitamin C sorgen.'],
    ],
    young: 'Junges',
    prefix: 'MJ',
  },
  goat: {
    kind: 'pregnancy',
    days: 150,
    early: 5,
    late: 5,
    steps: [
      [21, REMATING],
      [-56, 'Trockenstellen: etwa acht Wochen vor dem Lammen nicht mehr melken.'],
      [-42, 'Futter langsam steigern und Mineralfutter prüfen.'],
      [-7, 'Ablammbucht vorbereiten: sauber, trocken, frisch eingestreut.'],
    ],
    young: 'Kitz',
    prefix: 'ZK',
  },
  sheep: {
    kind: 'pregnancy',
    days: 147,
    early: 5,
    late: 5,
    steps: [
      [17, REMATING],
      [-42, 'Futter langsam steigern und Mineralfutter prüfen.'],
      [-7, 'Ablammbucht vorbereiten: sauber, trocken, frisch eingestreut.'],
    ],
    young: 'Lamm',
    prefix: 'SL',
  },
  pig: {
    kind: 'pregnancy',
    days: 115,
    early: 3,
    late: 3,
    steps: [
      [21, 'Auf Umrauschen achten – rauscht die Sau, ist sie nicht tragend.'],
      [-7, 'In die gereinigte Abferkelbucht umstallen.'],
    ],
    young: 'Ferkel',
    prefix: 'FE',
  },
  cattle: {
    kind: 'pregnancy',
    days: 283,
    early: 8,
    late: 8,
    steps: [
      [21, 'Auf Umrindern achten – zeigt sie Brunst, ist sie nicht tragend.'],
      [-56, 'Trockenstellen: etwa acht Wochen vor dem Kalben nicht mehr melken.'],
      [-7, 'Abkalbebox vorbereiten.'],
    ],
    young: 'Kalb',
    prefix: 'KA',
  },
  horse: {
    kind: 'pregnancy',
    days: 335,
    early: 15,
    late: 25,
    steps: [
      [16, 'Trächtigkeitsuntersuchung beim Tierarzt (Ultraschall).'],
      [-30, 'Abfohlbox vorbereiten und das Euter beobachten.'],
    ],
    young: 'Fohlen',
    prefix: 'FO',
  },
  // Alpakas (docs/alpaka.md): about 11.5 months, often longer in autumn and
  // winter; the mare ovulates on mating, so there is no heat to watch.
  alpaca: {
    kind: 'pregnancy',
    days: 345,
    early: 15,
    late: 20,
    steps: [
      [14, 'Spucktest: die Stute zum Hengst führen – spuckt sie ihn ab und legt sich nicht ab, ist sie wahrscheinlich tragend. Nach drei und sechs Wochen wiederholen.'],
      [60, 'Trächtigkeitsuntersuchung beim Tierarzt (Ultraschall).'],
      [-110, 'Letztes Drittel: Futter langsam steigern, Mineralfutter mit Vitamin D prüfen.'],
      [-14, 'Geburt vorbereiten: Alpakas fohlen meist vormittags. Handtücher, Waage und Jod für den Nabel bereitlegen; das Cria sollte in den ersten Stunden trinken.'],
    ],
    young: 'Cria',
    prefix: 'CR',
  },
  cat: {
    kind: 'pregnancy',
    days: 63,
    early: 5,
    late: 4,
    steps: [[-10, 'Wurfkiste an einem ruhigen, warmen Ort einrichten.']],
    young: 'Kätzchen',
    prefix: 'KÄ',
  },
  dog: {
    kind: 'pregnancy',
    days: 63,
    early: 5,
    late: 5,
    steps: [
      [28, 'Trächtigkeit beim Tierarzt per Ultraschall bestätigen lassen.'],
      [-7, 'Wurfkiste einrichten; ab jetzt täglich Temperatur messen.'],
    ],
    young: 'Welpe',
    prefix: 'WE',
  },
};

/** At most this many young are created in one go. */
export const MAX_YOUNG = 30;

export interface BreedingStep {
  on: string;
  text: string;
  past: boolean;
}

/** Expected day, its range and the steps, for a start day and length. */
export function schedule(species: FarmSpecies, startedOn: string, durationDays: number, today: string) {
  const rule = BREEDING[species]!;
  const dueOn = addDays(startedOn, durationDays);
  const steps: BreedingStep[] = rule.steps
    .map(([day, t]) => ({ on: day > 0 ? addDays(startedOn, day) : addDays(dueOn, day), text: t }))
    // A short incubation (quail) can bring steps after the hatch or before the start.
    .filter((s) => s.on > startedOn && s.on < dueOn)
    .concat([{ on: dueOn, text: rule.kind === 'incubation' ? 'Schlupf erwartet.' : 'Geburt erwartet.' }])
    .sort((a, b) => a.on.localeCompare(b.on))
    .map((s) => ({ ...s, past: s.on < today }));
  return { dueOn, earliestOn: addDays(dueOn, -rule.early), latestOn: addDays(dueOn, rule.late), steps };
}

// ── Relationship ──────────────────────────────────────────────────────────────

export interface Parents {
  motherId: number | null;
  fatherId: number | null;
}

function parentsOf(id: number, family: Map<number, Parents>): number[] {
  const p = family.get(id);
  return p ? ([p.motherId, p.fatherId].filter((x) => x !== null) as number[]) : [];
}

/** How two animals are related (parents and grandparents known to the app), or null. */
export function relation(a: number, b: number, family: Map<number, Parents>): string | null {
  const pa = parentsOf(a, family);
  const pb = parentsOf(b, family);
  if (pa.includes(b) || pb.includes(a)) return 'Elterntier und Nachkomme';
  const shared = pa.filter((p) => pb.includes(p)).length;
  if (shared === 2) return 'Vollgeschwister';
  if (shared === 1) return 'Halbgeschwister';
  const ga = pa.flatMap((p) => parentsOf(p, family));
  const gb = pb.flatMap((p) => parentsOf(p, family));
  if (ga.includes(b) || gb.includes(a)) return 'Großelternteil und Enkel';
  if (ga.some((g) => gb.includes(g))) return 'Cousins (gemeinsame Großeltern)';
  return null;
}

async function familyOf(farmId: number): Promise<Map<number, Parents>> {
  const rows = await db
    .select({ id: farmAnimalsTable.id, motherId: farmAnimalsTable.motherId, fatherId: farmAnimalsTable.fatherId })
    .from(farmAnimalsTable)
    .where(eq(farmAnimalsTable.farmId, farmId));
  return new Map(rows.map((r) => [r.id, { motherId: r.motherId, fatherId: r.fatherId }]));
}

// ── Records ───────────────────────────────────────────────────────────────────

export type BreedingStatus = 'running' | 'born' | 'failed';

export interface BreedingRecord {
  id: number;
  species: FarmSpecies;
  kind: BreedingKind;
  motherId: number | null;
  motherName: string | null;
  fatherId: number | null;
  /** The father's name: the animal's, or the one written in for a sire from elsewhere. */
  fatherName: string | null;
  startedOn: string;
  durationDays: number;
  eggCount: number | null;
  status: BreedingStatus;
  endedOn: string | null;
  bornAlive: number | null;
  bornDead: number | null;
  notes: string | null;
  dueOn: string;
  earliestOn: string;
  latestOn: string;
  /** Day of the pregnancy or incubation today (running only). */
  day: number | null;
  /** Running and past the latest normal day. */
  late: boolean;
  steps: BreedingStep[];
  /** Mother and father are related. */
  warning: string | null;
}

type Row = typeof breedingRecordsTable.$inferSelect;

async function toRecords(farmId: number, rows: Row[], today: string): Promise<BreedingRecord[]> {
  const ids = [...new Set(rows.flatMap((r) => [r.motherId, r.fatherId]).filter((x): x is number => x !== null))];
  const names = new Map(
    ids.length
      ? (await db.select({ id: farmAnimalsTable.id, name: farmAnimalsTable.name }).from(farmAnimalsTable).where(inArray(farmAnimalsTable.id, ids))).map((a) => [a.id, a.name])
      : [],
  );
  const family = rows.some((r) => r.motherId && r.fatherId) ? await familyOf(farmId) : new Map<number, Parents>();
  return rows.map((r) => {
    const plan = schedule(r.species, r.startedOn, r.durationDays, today);
    const running = r.status === 'running';
    const rel = r.motherId && r.fatherId ? relation(r.motherId, r.fatherId, family) : null;
    return {
      id: r.id,
      species: r.species,
      kind: BREEDING[r.species]?.kind ?? 'pregnancy',
      motherId: r.motherId,
      motherName: r.motherId ? (names.get(r.motherId) ?? null) : null,
      fatherId: r.fatherId,
      fatherName: r.fatherId ? (names.get(r.fatherId) ?? null) : r.fatherName,
      startedOn: r.startedOn,
      durationDays: r.durationDays,
      eggCount: r.eggCount,
      status: r.status as BreedingStatus,
      endedOn: r.endedOn,
      bornAlive: r.bornAlive,
      bornDead: r.bornDead,
      notes: r.notes,
      ...plan,
      day: running ? daysBetween(r.startedOn, today) : null,
      late: running && today > plan.latestOn,
      warning: rel ? `Mutter und Vater sind verwandt: ${rel}. Inzucht erhöht das Risiko für Erbfehler und schwache Jungtiere.` : null,
    };
  });
}

export async function listBreeding(farmId: number, today = berlinDay()): Promise<BreedingRecord[]> {
  const rows = await db
    .select()
    .from(breedingRecordsTable)
    .where(eq(breedingRecordsTable.farmId, farmId))
    .orderBy(asc(breedingRecordsTable.status), desc(breedingRecordsTable.startedOn), desc(breedingRecordsTable.id));
  // Running first (by start), then finished ones, newest first.
  const records = await toRecords(farmId, rows, today);
  return [...records.filter((r) => r.status === 'running').sort((a, b) => a.dueOn.localeCompare(b.dueOn)), ...records.filter((r) => r.status !== 'running')];
}

async function recordRow(farmId: number, id: number): Promise<Row> {
  const [row] = await db.select().from(breedingRecordsTable).where(and(eq(breedingRecordsTable.id, id), eq(breedingRecordsTable.farmId, farmId)));
  if (!row) throw notFound();
  return row;
}

export async function breedingRecord(farmId: number, id: number, today = berlinDay()): Promise<BreedingRecord> {
  return (await toRecords(farmId, [await recordRow(farmId, id)], today))[0]!;
}

export interface BreedingInput {
  species?: FarmSpecies;
  motherId?: number | null;
  fatherId?: number | null;
  fatherName?: unknown;
  startedOn: unknown;
  durationDays?: number | null;
  eggCount?: number | null;
  notes?: unknown;
}

async function parentAnimal(farmId: number, id: number, species: FarmSpecies, role: 'mother' | 'father') {
  const [animal] = await db
    .select({ id: farmAnimalsTable.id, name: farmAnimalsTable.name, species: farmAnimalsTable.species, sex: farmAnimalsTable.sex, archivedAt: farmAnimalsTable.archivedAt, herdId: farmAnimalsTable.herdId })
    .from(farmAnimalsTable)
    .where(and(eq(farmAnimalsTable.id, id), eq(farmAnimalsTable.farmId, farmId)));
  const label = role === 'mother' ? 'Das Muttertier' : 'Das Vatertier';
  if (!animal) throw new FarmDataError(400, `${label} gibt es auf der Farm nicht.`);
  if (animal.species !== species) throw new FarmDataError(400, `${label} ist eine andere Tierart.`);
  if (animal.archivedAt) throw new FarmDataError(400, `${label} ist archiviert.`);
  if (role === 'mother' ? animal.sex === 'male' || animal.sex === 'neutered' : animal.sex === 'female' || animal.sex === 'neutered') {
    throw new FarmDataError(400, role === 'mother' ? `${animal.name} ist kein weibliches Tier.` : `${animal.name} ist kein männliches Tier.`);
  }
  return animal;
}

async function values(farmId: number, species: FarmSpecies, input: BreedingInput, keepMother: number | null, editing: boolean) {
  const rule = BREEDING[species];
  if (!rule) throw new FarmDataError(400, 'Für diese Tierart gibt es keinen Zuchtplaner.');
  const startedOn = validDate(input.startedOn, rule.kind === 'incubation' ? 'Einlegedatum' : 'Deckdatum');
  const durationDays = input.durationDays ?? rule.days;
  if (!Number.isInteger(durationDays) || durationDays < 10 || durationDays > 400) throw new FarmDataError(400, 'Die Dauer liegt zwischen 10 und 400 Tagen.');

  // Editing keeps the mother as she was (she may be archived by now).
  const motherId = editing ? keepMother : (input.motherId ?? null);
  if (motherId !== null && !editing) {
    const mother = await parentAnimal(farmId, motherId, species, 'mother');
    const [running] = await db
      .select({ id: breedingRecordsTable.id })
      .from(breedingRecordsTable)
      .where(and(eq(breedingRecordsTable.farmId, farmId), eq(breedingRecordsTable.motherId, motherId), eq(breedingRecordsTable.status, 'running')));
    if (running) throw new FarmDataError(409, `Für ${mother.name} läuft schon eine Trächtigkeit.`);
  } else if (motherId === null && rule.kind === 'pregnancy') {
    throw new FarmDataError(400, 'Bitte wähle das Muttertier.');
  }
  const fatherId = input.fatherId ?? null;
  if (fatherId !== null) {
    if (fatherId === motherId) throw new FarmDataError(400, 'Mutter und Vater sind dasselbe Tier.');
    await parentAnimal(farmId, fatherId, species, 'father');
  }
  let eggCount: number | null = null;
  if (rule.kind === 'incubation') {
    eggCount = input.eggCount ?? null;
    if (eggCount === null || !Number.isInteger(eggCount) || eggCount < 1 || eggCount > 200) throw new FarmDataError(400, 'Bitte gib 1 bis 200 Eier an.');
  }
  return {
    species,
    motherId,
    fatherId,
    fatherName: fatherId === null ? text(input.fatherName, 60, 'Der Name des Vaters') : null,
    startedOn,
    durationDays,
    eggCount,
    notes: text(input.notes, 2000, 'Die Notiz'),
  };
}

export async function createBreeding(farmId: number, input: BreedingInput): Promise<BreedingRecord> {
  if (!input.species) throw new FarmDataError(400, 'Bitte wähle die Tierart.');
  const row = await values(farmId, input.species, input, null, false);
  const [created] = await db.insert(breedingRecordsTable).values({ farmId, ...row }).returning({ id: breedingRecordsTable.id });
  return breedingRecord(farmId, created!.id);
}

/** Change the father, the dates, the eggs or the note; species and mother stay. */
export async function updateBreeding(farmId: number, id: number, input: BreedingInput): Promise<BreedingRecord> {
  const row = await recordRow(farmId, id);
  const { species: _s, motherId: _m, ...set } = await values(farmId, row.species, input, row.motherId, true);
  await db.update(breedingRecordsTable).set(set).where(eq(breedingRecordsTable.id, id));
  return breedingRecord(farmId, id);
}

export async function deleteBreeding(farmId: number, id: number): Promise<void> {
  const deleted = await db
    .delete(breedingRecordsTable)
    .where(and(eq(breedingRecordsTable.id, id), eq(breedingRecordsTable.farmId, farmId)))
    .returning({ id: breedingRecordsTable.id });
  if (deleted.length === 0) throw notFound();
}

export interface BreedingEndInput {
  outcome: 'born' | 'failed';
  date: unknown;
  alive?: number | null;
  dead?: number | null;
  /** Create the young as animals of the farm (born only). */
  createYoung?: boolean;
  notes?: unknown;
}

/** Birth or hatch – with the young as new animals if wanted – or "nicht trächtig / abgebrochen". */
export async function endBreeding(farmId: number, id: number, input: BreedingEndInput): Promise<{ record: BreedingRecord; created: number }> {
  const row = await recordRow(farmId, id);
  if (row.status !== 'running') throw new FarmDataError(409, 'Dieser Eintrag ist schon abgeschlossen.');
  const date = validDate(input.date, 'Datum');
  if (date < row.startedOn) throw new FarmDataError(400, 'Das Datum liegt vor dem Beginn.');
  const notes = input.notes === undefined ? row.notes : text(input.notes, 2000, 'Die Notiz');
  if (input.outcome === 'failed') {
    await db.update(breedingRecordsTable).set({ status: 'failed', endedOn: date, notes }).where(eq(breedingRecordsTable.id, id));
    return { record: await breedingRecord(farmId, id), created: 0 };
  }
  const alive = input.alive ?? 0;
  const dead = input.dead ?? 0;
  const max = row.eggCount ?? MAX_YOUNG;
  if (![alive, dead].every((n) => Number.isInteger(n) && n >= 0) || alive + dead > max) {
    throw new FarmDataError(400, row.eggCount ? `Lebend und tot zusammen höchstens ${row.eggCount} – so viele Eier lagen im Brüter.` : `Lebend und tot zusammen höchstens ${MAX_YOUNG}.`);
  }
  const rule = BREEDING[row.species]!;
  const created = await db.transaction(async (tx) => {
    await tx.update(breedingRecordsTable).set({ status: 'born', endedOn: date, bornAlive: alive, bornDead: dead, notes }).where(eq(breedingRecordsTable.id, id));
    if (!input.createYoung || alive === 0) return 0;
    if (alive > MAX_YOUNG) throw new FarmDataError(400, `Höchstens ${MAX_YOUNG} Jungtiere auf einmal anlegen.`);
    const [mother] = row.motherId
      ? await tx.select({ herdId: farmAnimalsTable.herdId }).from(farmAnimalsTable).where(eq(farmAnimalsTable.id, row.motherId))
      : [];
    const rows = (await freeNumbers(tx, farmId, rule.prefix, alive)).map(({ k, nr }) => ({
      farmId,
      herdId: mother?.herdId ?? null,
      name: `${rule.young} ${k}`,
      species: row.species,
      registrationNumber: nr,
      sex: 'unknown' as const,
      birthDate: date,
      motherId: row.motherId,
      fatherId: row.fatherId,
    }));
    await tx.insert(farmAnimalsTable).values(rows);
    return rows.length;
  });
  return { record: await breedingRecord(farmId, id), created };
}

// ── Lineage on the animal page ────────────────────────────────────────────────

export interface Lineage {
  mother: { id: number; name: string } | null;
  father: { id: number; name: string } | null;
  offspring: { id: number; name: string; birthDate: string | null; archived: boolean }[];
}

export async function lineage(farmId: number, animalId: number): Promise<Lineage> {
  const [animal] = await db
    .select({ motherId: farmAnimalsTable.motherId, fatherId: farmAnimalsTable.fatherId })
    .from(farmAnimalsTable)
    .where(and(eq(farmAnimalsTable.id, animalId), eq(farmAnimalsTable.farmId, farmId)));
  if (!animal) throw notFound();
  const ids = [animal.motherId, animal.fatherId].filter((x): x is number => x !== null);
  const parents = ids.length
    ? await db.select({ id: farmAnimalsTable.id, name: farmAnimalsTable.name }).from(farmAnimalsTable).where(inArray(farmAnimalsTable.id, ids))
    : [];
  const offspring = await db
    .select({ id: farmAnimalsTable.id, name: farmAnimalsTable.name, birthDate: farmAnimalsTable.birthDate, archivedAt: farmAnimalsTable.archivedAt })
    .from(farmAnimalsTable)
    .where(and(eq(farmAnimalsTable.farmId, farmId), or(eq(farmAnimalsTable.motherId, animalId), eq(farmAnimalsTable.fatherId, animalId))))
    .orderBy(asc(farmAnimalsTable.birthDate), asc(farmAnimalsTable.name));
  const find = (id: number | null) => parents.find((p) => p.id === id) ?? null;
  return {
    mother: find(animal.motherId),
    father: find(animal.fatherId),
    offspring: offspring.map((o) => ({ id: o.id, name: o.name, birthDate: o.birthDate, archived: o.archivedAt !== null })),
  };
}

/** True when `candidate` descends from `animalId` (so it cannot be its parent). */
function descendsFrom(candidate: number, animalId: number, family: Map<number, Parents>): boolean {
  const seen = new Set<number>();
  const queue = [candidate];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === animalId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...parentsOf(id, family));
  }
  return false;
}

/** Set the parents of an animal by hand (animals bought in, or born before the app). */
export async function setLineage(farmId: number, animalId: number, input: Parents): Promise<Lineage> {
  const [animal] = await db
    .select({ species: farmAnimalsTable.species })
    .from(farmAnimalsTable)
    .where(and(eq(farmAnimalsTable.id, animalId), eq(farmAnimalsTable.farmId, farmId)));
  if (!animal) throw notFound();
  const family = await familyOf(farmId);
  for (const [id, role] of [
    [input.motherId, 'mother'],
    [input.fatherId, 'father'],
  ] as const) {
    if (id === null) continue;
    if (id === animalId) throw new FarmDataError(400, 'Ein Tier kann nicht sein eigenes Elterntier sein.');
    const [parent] = await db
      .select({ species: farmAnimalsTable.species, sex: farmAnimalsTable.sex })
      .from(farmAnimalsTable)
      .where(and(eq(farmAnimalsTable.id, id), eq(farmAnimalsTable.farmId, farmId)));
    if (!parent) throw new FarmDataError(400, 'Dieses Elterntier gibt es auf der Farm nicht.');
    if (parent.species !== animal.species) throw new FarmDataError(400, 'Das Elterntier ist eine andere Tierart.');
    if (role === 'mother' && parent.sex === 'male') throw new FarmDataError(400, 'Die Mutter ist als männlich eingetragen.');
    if (role === 'father' && parent.sex === 'female') throw new FarmDataError(400, 'Der Vater ist als weiblich eingetragen.');
    if (descendsFrom(id, animalId, family)) throw new FarmDataError(400, 'Ein Nachkomme kann nicht Elterntier sein.');
  }
  if (input.motherId !== null && input.motherId === input.fatherId) throw new FarmDataError(400, 'Mutter und Vater sind dasselbe Tier.');
  await db.update(farmAnimalsTable).set({ motherId: input.motherId, fatherId: input.fatherId }).where(eq(farmAnimalsTable.id, animalId));
  return lineage(farmId, animalId);
}

// ── Push: today's steps ───────────────────────────────────────────────────────

const PUSH_TIME = '07:30';

/**
 * "Lotte: Nestbox … · Brut (12 Eier): Schieren …", or null when nothing is due
 * today. `extra`: heats and weanings (breedingCycle.ts cycleLines).
 */
export function breedingMessage(records: BreedingRecord[], day: string, extra: string[] = []): { title: string; body: string } | null {
  const lines = records
    .filter((r) => r.status === 'running')
    .flatMap((r) => r.steps.filter((s) => s.on === day).map((s) => `${r.motherName ?? `Brut (${r.eggCount} Eier)`}: ${s.text}`))
    .concat(extra);
  if (lines.length === 0) return null;
  return { title: lines.length === 1 ? 'Zucht: heute zu tun' : `Zucht: ${lines.length} Dinge heute`, body: lines.join(' · ') };
}

export async function sendBreedingDigests(hhmm: string, day: string): Promise<number> {
  if (hhmm < PUSH_TIME) return 0;
  let sent = 0;
  try {
    // Running pregnancies, births (weaning) and heats seen.
    const farms = await db
      .selectDistinct({ farmId: breedingRecordsTable.farmId })
      .from(breedingRecordsTable)
      .union(db.selectDistinct({ farmId: heatRecordsTable.farmId }).from(heatRecordsTable));
    if (farms.length === 0) return 0;
    await db.delete(farmPushLogTable).where(and(eq(farmPushLogTable.topic, 'breeding'), lt(farmPushLogTable.day, addDays(day, -14))));
    for (const { farmId } of farms) {
      try {
        const message = breedingMessage(await listBreeding(farmId, day), day, cycleLines(await breedingCycles(farmId, day), day));
        if (!message) continue;
        const claimed = await db.insert(farmPushLogTable).values({ farmId, topic: 'breeding', day }).onConflictDoNothing().returning();
        if (claimed.length === 0) continue;
        const members = await db
          .select({ userId: farmMembershipsTable.userId })
          .from(farmMembershipsTable)
          .where(and(eq(farmMembershipsTable.farmId, farmId), inArray(farmMembershipsTable.role, ['admin', 'caretaker']), grantedSql('breeding')));
        for (const { userId } of members) {
          await sendPushToUser(userId, { topic: 'breeding', ...message, tag: `breeding-${farmId}-${day}`, url: '/farm/zucht' });
        }
        sent += 1;
      } catch (err) {
        logger.warn({ err, farmId }, 'Breeding push failed');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Breeding pushes failed');
  }
  return sent;
}
