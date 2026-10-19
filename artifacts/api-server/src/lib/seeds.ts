/**
 * Saatgut ("Beet-Architekt"): the farm's seed packets and saved seeds, how long
 * they still germinate, germination tests, and what the season's bed plan
 * needs that is not in stock. Fixed rules per crop, no AI (docs/saatgut.md):
 * the years are the usual table values for seed kept cool and dry.
 */

import { bedPlantingsTable, db, seedsTable } from '@workspace/db';
import { and, asc, eq, gte, isNotNull } from 'drizzle-orm';

import { FarmDataError, notFound, text, validDate } from './farmAnimals';
import { cropByKey } from './gardenCatalog';
import { berlinDay } from './monitoring';

/** How seed is saved: self-pollinating, needs isolation, flowers in its second year, or not grown from seed. */
export type Saving = 'easy' | 'isolate' | 'biennial' | 'vegetative';

/** Years a crop's seed germinates well after its harvest year, and how to save it. */
export const SEED_LIFE: Record<string, [number, Saving]> = {
  tomate: [4, 'easy'],
  paprika: [3, 'isolate'],
  chili: [3, 'isolate'],
  aubergine: [4, 'easy'],
  kartoffel: [1, 'vegetative'],
  gurke: [6, 'isolate'],
  zucchini: [4, 'isolate'],
  kuerbis: [5, 'isolate'],
  buschbohne: [3, 'easy'],
  stangenbohne: [3, 'easy'],
  erbse: [3, 'easy'],
  moehre: [3, 'biennial'],
  pastinake: [1, 'biennial'],
  petersilie: [2, 'biennial'],
  sellerie: [4, 'biennial'],
  fenchel: [3, 'isolate'],
  dill: [3, 'isolate'],
  koriander: [4, 'isolate'],
  kohlrabi: [4, 'biennial'],
  brokkoli: [4, 'isolate'],
  blumenkohl: [4, 'isolate'],
  weisskohl: [4, 'biennial'],
  gruenkohl: [4, 'biennial'],
  radieschen: [4, 'isolate'],
  rettich: [4, 'isolate'],
  rucola: [4, 'isolate'],
  spinat: [3, 'isolate'],
  mangold: [4, 'biennial'],
  rote_bete: [4, 'biennial'],
  salat: [3, 'easy'],
  ringelblume: [3, 'easy'],
  tagetes: [3, 'easy'],
  feldsalat: [3, 'easy'],
  mais: [2, 'isolate'],
  zwiebel: [1, 'biennial'],
  lauch: [2, 'biennial'],
  knoblauch: [1, 'vegetative'],
  schnittlauch: [1, 'isolate'],
  basilikum: [4, 'isolate'],
  thymian: [3, 'isolate'],
  salbei: [2, 'isolate'],
  rosmarin: [2, 'isolate'],
  oregano: [3, 'isolate'],
  minze: [2, 'vegetative'],
  bohnenkraut: [2, 'easy'],
  kapuzinerkresse: [4, 'easy'],
  borretsch: [3, 'easy'],
  erdbeere: [2, 'vegetative'],
  rhabarber: [3, 'vegetative'],
};
/** For seeds of a crop the table does not know. */
export const DEFAULT_LIFE = 3;

/** A test at most this old counts instead of the age. */
export const TEST_VALID_DAYS = 365;

export const SEED_UNITS = ['Tüten', 'g', 'Korn'] as const;
export const SEED_SOURCES = ['bought', 'saved', 'swapped'] as const;

export type SeedStatus = 'ok' | 'check' | 'old' | 'weak' | 'empty' | 'archived';

type Row = typeof seedsTable.$inferSelect;

/**
 * ok: germinates well · check: last good year or age unknown – do a test ·
 * old: past its years – test or sow thicker · weak: a recent test found under
 * half germinating · empty · archived.
 */
export function seedStatus(
  s: Pick<Row, 'cropKey' | 'amount' | 'harvestYear' | 'useBy' | 'testSown' | 'testGerminated' | 'testedOn' | 'archivedAt'>,
  today: string,
): { status: SeedStatus; goodUntil: number | null; germinationRate: number | null } {
  const life = (s.cropKey && SEED_LIFE[s.cropKey]?.[0]) || DEFAULT_LIFE;
  const goodUntil = s.useBy ? Number(s.useBy.slice(0, 4)) : s.harvestYear ? s.harvestYear + life : null;
  const rate = s.testSown && s.testGerminated !== null ? s.testGerminated / s.testSown : null;
  const recentTest = rate !== null && s.testedOn !== null && Date.parse(today) - Date.parse(s.testedOn) <= TEST_VALID_DAYS * 86_400_000;
  const base = { goodUntil, germinationRate: rate };
  if (s.archivedAt) return { status: 'archived', ...base };
  if (s.amount <= 0) return { status: 'empty', ...base };
  if (recentTest) return { status: rate! >= 0.7 ? 'ok' : rate! >= 0.5 ? 'check' : 'weak', ...base };
  const year = Number(today.slice(0, 4));
  if (goodUntil === null || year === goodUntil) return { status: 'check', ...base };
  return { status: year < goodUntil ? 'ok' : 'old', ...base };
}

export interface Seed {
  id: number;
  cropKey: string | null;
  cropName: string | null;
  name: string;
  variety: string | null;
  amount: number;
  unit: string;
  source: string;
  harvestYear: number | null;
  useBy: string | null;
  openPollinated: boolean | null;
  testSown: number | null;
  testGerminated: number | null;
  testedOn: string | null;
  notes: string | null;
  archived: boolean;
  status: SeedStatus;
  goodUntil: number | null;
  germinationRate: number | null;
  saving: Saving | null;
}

function toSeed(row: Row, today: string): Seed {
  return {
    id: row.id,
    cropKey: row.cropKey,
    cropName: row.cropKey ? (cropByKey(row.cropKey)?.name ?? null) : null,
    name: row.name,
    variety: row.variety,
    amount: row.amount,
    unit: row.unit,
    source: row.source,
    harvestYear: row.harvestYear,
    useBy: row.useBy,
    openPollinated: row.openPollinated,
    testSown: row.testSown,
    testGerminated: row.testGerminated,
    testedOn: row.testedOn,
    notes: row.notes,
    archived: row.archivedAt !== null,
    ...seedStatus(row, today),
    saving: row.cropKey ? (SEED_LIFE[row.cropKey]?.[1] ?? null) : null,
  };
}

export interface SeedPlanItem {
  cropKey: string;
  name: string;
  /** Grown from tubers, cloves, runners or division – Pflanzgut, not seed. */
  vegetative: boolean;
}

export interface SeedOverview {
  seeds: Seed[];
  /** The bed plan from this season on: crops without seed in stock, and crops with only old or weak seed. */
  plan: { season: number; missing: SeedPlanItem[]; check: SeedPlanItem[] };
}

/** Pure: compare the planned crops with the stock. */
export function seedPlan(planned: string[], seeds: Seed[]): { missing: SeedPlanItem[]; check: SeedPlanItem[] } {
  const missing: SeedPlanItem[] = [];
  const check: SeedPlanItem[] = [];
  for (const key of [...new Set(planned)].sort()) {
    const crop = cropByKey(key);
    if (!crop) continue;
    const item = { cropKey: key, name: crop.name, vegetative: SEED_LIFE[key]?.[1] === 'vegetative' };
    const lots = seeds.filter((s) => s.cropKey === key && s.status !== 'archived' && s.status !== 'empty');
    if (lots.length === 0) missing.push(item);
    else if (lots.every((s) => s.status === 'old' || s.status === 'weak')) check.push(item);
  }
  return { missing, check };
}

export async function seedOverview(farmId: number, today = berlinDay()): Promise<SeedOverview> {
  const season = Number(today.slice(0, 4));
  const [rows, planned] = await Promise.all([
    db.select().from(seedsTable).where(eq(seedsTable.farmId, farmId)).orderBy(asc(seedsTable.name), asc(seedsTable.id)),
    db
      .selectDistinct({ cropKey: bedPlantingsTable.cropKey })
      .from(bedPlantingsTable)
      .where(and(eq(bedPlantingsTable.farmId, farmId), gte(bedPlantingsTable.season, season), isNotNull(bedPlantingsTable.cropKey))),
  ]);
  const seeds = rows.map((r) => toSeed(r, today));
  // Archived lots last.
  seeds.sort((a, b) => Number(a.archived) - Number(b.archived));
  return { seeds, plan: { season, ...seedPlan(planned.map((p) => p.cropKey!), seeds) } };
}

export interface SeedInput {
  cropKey?: string | null;
  name?: unknown;
  variety?: unknown;
  amount: number;
  unit: string;
  source?: string;
  harvestYear?: number | null;
  useBy?: string | null;
  openPollinated?: boolean | null;
  notes?: unknown;
  archived?: boolean;
}

function values(input: SeedInput, today: string) {
  const crop = input.cropKey ? cropByKey(input.cropKey) : null;
  if (input.cropKey && !crop) throw new FarmDataError(400, 'Diese Kultur gibt es nicht.');
  const name = text(input.name, 60, 'Der Name') ?? crop?.name;
  if (!name) throw new FarmDataError(400, 'Bitte gib an, was es für Saatgut ist.');
  if (!Number.isFinite(input.amount) || input.amount < 0 || input.amount > 100_000) throw new FarmDataError(400, 'Die Menge ist ungültig.');
  if (!(SEED_UNITS as readonly string[]).includes(input.unit)) throw new FarmDataError(400, 'Die Einheit ist ungültig.');
  const source = input.source ?? 'bought';
  if (!(SEED_SOURCES as readonly string[]).includes(source)) throw new FarmDataError(400, 'Die Herkunft ist ungültig.');
  const year = Number(today.slice(0, 4));
  const harvestYear = input.harvestYear ?? null;
  if (harvestYear !== null && (!Number.isInteger(harvestYear) || harvestYear < 1990 || harvestYear > year)) {
    throw new FarmDataError(400, `Das Erntejahr liegt zwischen 1990 und ${year}.`);
  }
  let useBy: string | null = null;
  if (input.useBy) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.useBy) || Number.isNaN(Date.parse(input.useBy)) || new Date(`${input.useBy}T00:00:00Z`).toISOString().slice(0, 10) !== input.useBy) {
      throw new FarmDataError(400, 'Das Datum „verwendbar bis“ ist ungültig.');
    }
    useBy = input.useBy;
  }
  return {
    cropKey: crop?.key ?? null,
    name,
    variety: text(input.variety, 60, 'Die Sorte'),
    amount: input.amount,
    unit: input.unit,
    source,
    harvestYear,
    useBy,
    openPollinated: input.openPollinated ?? null,
    notes: text(input.notes, 2000, 'Die Notiz'),
    ...(input.archived === undefined ? {} : { archivedAt: input.archived ? new Date() : null }),
  };
}

async function seedRow(farmId: number, id: number): Promise<Row> {
  const [row] = await db.select().from(seedsTable).where(and(eq(seedsTable.id, id), eq(seedsTable.farmId, farmId)));
  if (!row) throw notFound();
  return row;
}

export async function createSeed(farmId: number, input: SeedInput, today = berlinDay()): Promise<Seed> {
  const [row] = await db.insert(seedsTable).values({ farmId, ...values(input, today) }).returning();
  return toSeed(row!, today);
}

export async function updateSeed(farmId: number, id: number, input: SeedInput, today = berlinDay()): Promise<Seed> {
  const current = await seedRow(farmId, id);
  const set = values(input, today);
  // Archiving twice keeps the first date.
  if (input.archived && current.archivedAt) delete (set as { archivedAt?: Date }).archivedAt;
  const [row] = await db.update(seedsTable).set(set).where(eq(seedsTable.id, id)).returning();
  return toSeed(row!, today);
}

export async function deleteSeed(farmId: number, id: number): Promise<void> {
  const deleted = await db.delete(seedsTable).where(and(eq(seedsTable.id, id), eq(seedsTable.farmId, farmId))).returning({ id: seedsTable.id });
  if (deleted.length === 0) throw notFound();
}

export interface GerminationTestInput {
  sown: number;
  germinated: number;
  testedOn: unknown;
}

/** Record a germination test (e.g. 20 seeds on damp kitchen paper, counted after two weeks). */
export async function recordTest(farmId: number, id: number, input: GerminationTestInput, today = berlinDay()): Promise<Seed> {
  await seedRow(farmId, id);
  if (!Number.isInteger(input.sown) || input.sown < 1 || input.sown > 1000) throw new FarmDataError(400, 'Bitte 1 bis 1000 ausgelegte Samen angeben.');
  if (!Number.isInteger(input.germinated) || input.germinated < 0 || input.germinated > input.sown) {
    throw new FarmDataError(400, 'Es können nicht mehr Samen keimen als ausgelegt wurden.');
  }
  const testedOn = validDate(input.testedOn, 'Datum der Keimprobe');
  const [row] = await db
    .update(seedsTable)
    .set({ testSown: input.sown, testGerminated: input.germinated, testedOn })
    .where(eq(seedsTable.id, id))
    .returning();
  return toSeed(row!, today);
}
