/**
 * Bienen (docs/bienen.md): the farm's colonies with their digital hive card –
 * inspections, feedings, Varroa checks and treatments (with the medicine
 * taken off the Arzneimittel-Vorrat, for the Bestandsbuch) and the honey,
 * which goes into farm_yields so Ertrag & Bilanz counts it.
 *
 * Hints and the morning push follow fixed rules of the beekeeping year
 * (swarm checks, Varroa thresholds, summer and winter treatment, feeding).
 */

import {
  BEE_COLONY_STATUSES,
  BEE_FEED_KINDS,
  VARROA_METHODS,
  beeColoniesTable,
  beeFeedingsTable,
  beeInspectionsTable,
  beeTreatmentsTable,
  db,
  farmMembershipsTable,
  farmPushLogTable,
  farmYieldsTable,
  type BeeColonyStatus,
  type BeeFeedKind,
  type VarroaMethod,
} from '@workspace/db';
import { and, asc, desc, eq, gte, inArray, lt } from 'drizzle-orm';

import { deleteImageByUrl } from './imageStorage';
import { FarmDataError, notFound, text, validDate } from './farmAnimals';
import { grantedSql } from './farmModules';
import { addDays } from './feedSeason';
import { logger } from './logger';
import { adjustStock, usableMedicine } from './medicines';
import { berlinDay } from './monitoring';
import { sendPushToUser } from './webPush';
import { certified, getFarming } from './farming';

export const BEE_PUSH_TIME = '07:30';
/** Days between swarm checks in the swarming season. */
export const SWARM_CHECK_DAYS = 9;

// ── Rules (pure) ──────────────────────────────────────────────────────────────

export type VarroaLevel = 'ok' | 'watch' | 'treat';

/**
 * Natural mite fall per day against rough thresholds of the bee institutes,
 * which are stricter in autumn and winter, when there is little brood.
 */
export function varroaLevel(mitesPerDay: number, day: string): VarroaLevel {
  const month = Number(day.slice(5, 7));
  const [watch, treat] = month >= 4 && month <= 6 ? [3, 10] : month >= 7 && month <= 9 ? [5, 10] : [0.5, 1];
  return mitesPerDay >= treat ? 'treat' : mitesPerDay >= watch ? 'watch' : 'ok';
}

export interface ColonyFacts {
  id: number;
  name: string;
  status: BeeColonyStatus;
  queenYear: number | null;
  lastInspection: { date: string; queenCells: number | null; mitesPerDay: number | null } | null;
  lastMiteCount: { date: string; mitesPerDay: number } | null;
  lastTreatmentOn: string | null;
  feedKgSince: (from: string) => number;
}

export type BeeHintKind = 'swarm-check' | 'swarm' | 'varroa' | 'summer-treatment' | 'winter-treatment' | 'feeding' | 'old-queen';

export interface BeeHint {
  kind: BeeHintKind;
  colonyId: number;
  urgent: boolean;
  text: string;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const deDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

/** What a colony needs now – shown on the page. */
export function colonyHints(c: ColonyFacts, today: string): BeeHint[] {
  if (c.status !== 'active') return [];
  const month = Number(today.slice(5, 7));
  const year = today.slice(0, 4);
  const hints: BeeHint[] = [];
  const hint = (kind: BeeHintKind, urgent: boolean, text: string) => hints.push({ kind, colonyId: c.id, urgent, text });

  if (month >= 4 && month <= 6) {
    const since = c.lastInspection ? daysBetween(c.lastInspection.date, today) : null;
    if (c.lastInspection && (c.lastInspection.queenCells ?? 0) > 0 && since! <= SWARM_CHECK_DAYS) {
      hint('swarm', true, `Weiselzellen bei der Durchsicht am ${deDay(c.lastInspection.date)}: Schwarmstimmung. Zellen brechen oder einen Ableger bilden.`);
    } else if (since === null || since >= SWARM_CHECK_DAYS) {
      hint('swarm-check', since !== null && since > SWARM_CHECK_DAYS + 3, since === null ? 'Schwarmzeit: erste Durchsicht eintragen, dann alle 7–9 Tage.' : `Schwarmkontrolle fällig – letzte Durchsicht vor ${since} Tagen.`);
    }
  }
  if (c.lastMiteCount && daysBetween(c.lastMiteCount.date, today) <= 30) {
    const level = varroaLevel(c.lastMiteCount.mitesPerDay, c.lastMiteCount.date);
    const mites = String(c.lastMiteCount.mitesPerDay).replace('.', ',');
    if (level === 'treat') hint('varroa', true, `Varroa: ${mites} Milben am Tag (${deDay(c.lastMiteCount.date)}) – bald behandeln.`);
    else if (level === 'watch') hint('varroa', false, `Varroa: ${mites} Milben am Tag (${deDay(c.lastMiteCount.date)}) – im Auge behalten, in 1–2 Wochen wieder zählen.`);
  }
  if ((month === 7 || month === 8) && !(c.lastTreatmentOn && c.lastTreatmentOn >= `${year}-06-01`)) {
    hint('summer-treatment', month === 8, 'Sommerbehandlung gegen Varroa nach der letzten Honigernte (z. B. Ameisensäure).');
  }
  if (month === 8 || month === 9) {
    const kg = c.feedKgSince(`${year}-07-15`);
    if (kg < 15) hint('feeding', month === 9, `Einfüttern: bisher ${String(Math.round(kg * 10) / 10).replace('.', ',')} kg – bis Ende September etwa 15–20 kg Futter je Volk.`);
  }
  if (month === 12 && !(c.lastTreatmentOn && c.lastTreatmentOn >= `${year}-11-15`)) {
    hint('winter-treatment', false, 'Winterbehandlung im brutfreien Volk (Oxalsäure), meist im Dezember.');
  }
  if (c.queenYear !== null && Number(year) - c.queenYear >= 3) {
    hint('old-queen', false, `Die Königin ist von ${c.queenYear} – ab dem dritten Jahr lässt sie oft nach. Umweiseln überlegen.`);
  }
  return hints;
}

/** The morning push: only on the day a reminder comes due, so it does not nag. */
export function pushLines(colonies: ColonyFacts[], today: string): string[] {
  const md = today.slice(5);
  const month = Number(today.slice(5, 7));
  const year = today.slice(0, 4);
  const lines: string[] = [];
  for (const c of colonies.filter((x) => x.status === 'active')) {
    if (month >= 4 && month <= 6) {
      if (c.lastInspection ? daysBetween(c.lastInspection.date, today) === SWARM_CHECK_DAYS : md === '04-01') {
        lines.push(`${c.name}: Schwarmkontrolle fällig`);
      }
    }
    if (md === '07-25' && !(c.lastTreatmentOn && c.lastTreatmentOn >= `${year}-06-01`)) lines.push(`${c.name}: Sommerbehandlung gegen Varroa einplanen`);
    if (md === '08-15' && c.feedKgSince(`${year}-07-15`) < 15) lines.push(`${c.name}: einfüttern`);
    if (md === '12-10' && !(c.lastTreatmentOn && c.lastTreatmentOn >= `${year}-11-15`)) lines.push(`${c.name}: Winterbehandlung im brutfreien Volk`);
  }
  return lines;
}

// ── Colonies ─────────────────────────────────────────────────────────────────

export interface ColonyInput {
  name: unknown;
  apiary?: unknown;
  hiveType?: unknown;
  queenYear?: number | null;
  queenMarked?: boolean;
  queenOrigin?: unknown;
  status?: BeeColonyStatus;
  startedOn?: unknown;
  endedOn?: unknown;
  notes?: unknown;
}

function optionalDate(raw: unknown, label: string): string | null {
  return raw === undefined || raw === null || raw === '' ? null : validDate(raw, label);
}

function colonyValues(input: ColonyInput, today: string) {
  const status = input.status ?? 'active';
  if (!(BEE_COLONY_STATUSES as readonly string[]).includes(status)) throw new FarmDataError(400, 'Diesen Status gibt es nicht.');
  const queenYear = input.queenYear ?? null;
  if (queenYear !== null && (!Number.isInteger(queenYear) || queenYear < 2000 || queenYear > Number(today.slice(0, 4)))) {
    throw new FarmDataError(400, 'Das Jahr der Königin ist ungültig.');
  }
  return {
    name: text(input.name, 60, 'Der Name', true),
    apiary: text(input.apiary, 80, 'Der Bienenstand'),
    hiveType: text(input.hiveType, 40, 'Die Beute'),
    queenYear,
    queenMarked: input.queenMarked === true,
    queenOrigin: text(input.queenOrigin, 80, 'Die Herkunft'),
    status,
    startedOn: optionalDate(input.startedOn, 'Datum'),
    endedOn: status === 'active' ? null : (optionalDate(input.endedOn, 'Datum') ?? today),
    notes: text(input.notes, 1000, 'Die Notiz'),
  };
}

async function colonyOf(farmId: number, colonyId: number) {
  const [row] = await db
    .select()
    .from(beeColoniesTable)
    .where(and(eq(beeColoniesTable.id, colonyId), eq(beeColoniesTable.farmId, farmId)));
  if (!row) throw notFound();
  return row;
}

export async function createColony(farmId: number, input: ColonyInput, today = berlinDay()) {
  const [row] = await db
    .insert(beeColoniesTable)
    .values({ farmId, ...colonyValues(input, today) })
    .returning({ id: beeColoniesTable.id });
  return colonyDetail(farmId, row!.id, today);
}

export async function updateColony(farmId: number, colonyId: number, input: ColonyInput, today = berlinDay()) {
  await colonyOf(farmId, colonyId);
  await db.update(beeColoniesTable).set(colonyValues(input, today)).where(eq(beeColoniesTable.id, colonyId));
  return colonyDetail(farmId, colonyId, today);
}

/** Gone with its hive card; its honey stays in Ertrag & Bilanz. */
export async function deleteColony(farmId: number, colonyId: number): Promise<void> {
  const colony = await colonyOf(farmId, colonyId);
  await db.delete(beeColoniesTable).where(eq(beeColoniesTable.id, colonyId));
  if (colony.photoUrl) void deleteImageByUrl(colony.photoUrl).catch(() => false);
}

// ── Facts and overview ───────────────────────────────────────────────────────

async function factsOf(farmId: number, colonyIds: number[]) {
  if (colonyIds.length === 0) return { inspections: [], feedings: [], treatments: [], honey: [] };
  const [inspections, feedings, treatments, honey] = await Promise.all([
    db.select().from(beeInspectionsTable).where(and(eq(beeInspectionsTable.farmId, farmId), inArray(beeInspectionsTable.colonyId, colonyIds))).orderBy(desc(beeInspectionsTable.date), desc(beeInspectionsTable.id)),
    db.select().from(beeFeedingsTable).where(and(eq(beeFeedingsTable.farmId, farmId), inArray(beeFeedingsTable.colonyId, colonyIds))).orderBy(desc(beeFeedingsTable.date), desc(beeFeedingsTable.id)),
    db.select().from(beeTreatmentsTable).where(and(eq(beeTreatmentsTable.farmId, farmId), inArray(beeTreatmentsTable.colonyId, colonyIds))).orderBy(desc(beeTreatmentsTable.date), desc(beeTreatmentsTable.id)),
    db
      .select({ id: farmYieldsTable.id, colonyId: farmYieldsTable.colonyId, date: farmYieldsTable.date, amountKg: farmYieldsTable.amount, note: farmYieldsTable.note })
      .from(farmYieldsTable)
      .where(and(eq(farmYieldsTable.farmId, farmId), eq(farmYieldsTable.product, 'honey'), inArray(farmYieldsTable.colonyId, colonyIds)))
      .orderBy(desc(farmYieldsTable.date), desc(farmYieldsTable.id)),
  ]);
  return { inspections, feedings, treatments, honey };
}

type Facts = Awaited<ReturnType<typeof factsOf>>;
type ColonyRow = typeof beeColoniesTable.$inferSelect;

function colonyFacts(c: ColonyRow, f: Facts): ColonyFacts {
  const inspections = f.inspections.filter((i) => i.colonyId === c.id);
  const last = inspections[0];
  const counted = inspections.find((i) => i.mitesPerDay !== null);
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    queenYear: c.queenYear,
    lastInspection: last ? { date: last.date, queenCells: last.queenCells, mitesPerDay: last.mitesPerDay } : null,
    lastMiteCount: counted ? { date: counted.date, mitesPerDay: counted.mitesPerDay! } : null,
    lastTreatmentOn: f.treatments.find((t) => t.colonyId === c.id)?.date ?? null,
    feedKgSince: (from) => f.feedings.filter((x) => x.colonyId === c.id && x.date >= from).reduce((s, x) => s + x.amountKg, 0),
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function summary(c: ColonyRow, f: Facts, today: string) {
  const facts = colonyFacts(c, f);
  const year = today.slice(0, 4);
  const lastInspection = f.inspections.find((i) => i.colonyId === c.id) ?? null;
  return {
    ...c,
    lastInspectionOn: lastInspection?.date ?? null,
    beeFrames: lastInspection?.beeFrames ?? null,
    lastMites: facts.lastMiteCount,
    lastTreatmentOn: facts.lastTreatmentOn,
    honeyKgThisYear: r1(f.honey.filter((h) => h.colonyId === c.id && h.date.startsWith(year)).reduce((s, h) => s + h.amountKg, 0)),
    feedKgThisYear: r1(facts.feedKgSince(`${year}-01-01`)),
    hints: colonyHints(facts, today),
  };
}

export async function beeOverview(farmId: number, today = berlinDay()) {
  const colonies = await db
    .select()
    .from(beeColoniesTable)
    .where(eq(beeColoniesTable.farmId, farmId))
    .orderBy(asc(beeColoniesTable.status), asc(beeColoniesTable.name));
  const facts = await factsOf(farmId, colonies.map((c) => c.id));
  const list = colonies.map((c) => summary(c, facts, today));
  const year = today.slice(0, 4);
  return {
    colonies: list,
    active: list.filter((c) => c.status === 'active').length,
    honeyKgThisYear: r1(list.reduce((s, c) => s + c.honeyKgThisYear, 0)),
    // Ever used, for the apiary field's suggestions.
    apiaries: [...new Set(colonies.map((c) => c.apiary).filter((a): a is string => !!a))].sort((a, b) => a.localeCompare(b, 'de')),
    year: Number(year),
  };
}

export async function colonyDetail(farmId: number, colonyId: number, today = berlinDay()) {
  const colony = await colonyOf(farmId, colonyId);
  const facts = await factsOf(farmId, [colonyId]);
  return {
    colony: summary(colony, facts, today),
    inspections: facts.inspections.map(({ farmId: _f, createdAt: _c, ...i }) => i),
    feedings: facts.feedings.map(({ farmId: _f, createdAt: _c, ...x }) => x),
    treatments: facts.treatments.map(({ farmId: _f, createdAt: _c, ...t }) => t),
    honey: facts.honey,
  };
}

// ── Hive card entries ────────────────────────────────────────────────────────

function count(raw: number | null | undefined, max: number, label: string): number | null {
  if (raw === undefined || raw === null) return null;
  if (!Number.isInteger(raw) || raw < 0 || raw > max) throw new FarmDataError(400, `${label} liegt zwischen 0 und ${max}.`);
  return raw;
}

function kg(raw: number | null | undefined, max: number, label: string, required: true): number;
function kg(raw: number | null | undefined, max: number, label: string, required?: false): number | null;
function kg(raw: number | null | undefined, max: number, label: string, required = false): number | null {
  if (raw === undefined || raw === null) {
    if (required) throw new FarmDataError(400, `${label} fehlt.`);
    return null;
  }
  if (!Number.isFinite(raw) || raw < 0 || raw > max || (required && raw === 0)) throw new FarmDataError(400, `${label} ist ungültig.`);
  return Math.round(raw * 100) / 100;
}

export interface InspectionInput {
  date: unknown;
  beeFrames?: number | null;
  broodFrames?: number | null;
  queenSeen?: boolean;
  eggsSeen?: boolean;
  queenCells?: number | null;
  temper?: number | null;
  foodKg?: number | null;
  mitesPerDay?: number | null;
  notes?: unknown;
}

export async function addInspection(farmId: number, colonyId: number, input: InspectionInput) {
  await colonyOf(farmId, colonyId);
  const temper = count(input.temper, 4, 'Die Sanftmut');
  if (temper === 0) throw new FarmDataError(400, 'Die Sanftmut liegt zwischen 1 und 4.');
  await db.insert(beeInspectionsTable).values({
    farmId,
    colonyId,
    date: validDate(input.date, 'Datum'),
    beeFrames: count(input.beeFrames, 40, 'Die Zahl der Waben'),
    broodFrames: count(input.broodFrames, 40, 'Die Zahl der Brutwaben'),
    queenSeen: input.queenSeen === true,
    eggsSeen: input.eggsSeen === true,
    queenCells: count(input.queenCells, 99, 'Die Zahl der Weiselzellen'),
    temper,
    foodKg: kg(input.foodKg, 60, 'Das Futter'),
    mitesPerDay: kg(input.mitesPerDay, 2000, 'Der Milbenfall'),
    notes: text(input.notes, 1000, 'Die Notiz'),
  });
  return colonyDetail(farmId, colonyId);
}

export interface FeedingInput {
  date: unknown;
  kind: BeeFeedKind;
  amountKg: number;
  notes?: unknown;
}

export async function addFeeding(farmId: number, colonyId: number, input: FeedingInput) {
  await colonyOf(farmId, colonyId);
  if (!(BEE_FEED_KINDS as readonly string[]).includes(input.kind)) throw new FarmDataError(400, 'Dieses Futter gibt es nicht.');
  await db.insert(beeFeedingsTable).values({
    farmId,
    colonyId,
    date: validDate(input.date, 'Datum'),
    kind: input.kind,
    amountKg: kg(input.amountKg, 100, 'Die Menge', true),
    notes: text(input.notes, 500, 'Die Notiz'),
  });
  return colonyDetail(farmId, colonyId);
}

export interface TreatmentInput {
  date: unknown;
  method: VarroaMethod;
  medicineId?: number | null;
  product?: unknown;
  dose?: number | null;
  notes?: unknown;
}

/** A medicine from the stock: the dose is taken off it, its name, unit and batch are kept. */
export async function addTreatment(farmId: number, colonyId: number, input: TreatmentInput) {
  await colonyOf(farmId, colonyId);
  if (!(VARROA_METHODS as readonly string[]).includes(input.method)) throw new FarmDataError(400, 'Diese Behandlung gibt es nicht.');
  const date = validDate(input.date, 'Datum');
  const medicine = input.medicineId != null ? await usableMedicine(farmId, input.medicineId) : null;
  const dose = kg(input.dose, 100_000, 'Die Menge');
  if (medicine) {
    if (dose === null || dose === 0) throw new FarmDataError(400, `Bitte gib die Menge in ${medicine.unit} an.`);
    if (medicine.archivedAt) throw new FarmDataError(400, `${medicine.name} ist als aufgebraucht oder entsorgt markiert.`);
    if (medicine.expiresOn && medicine.expiresOn < date) throw new FarmDataError(400, `${medicine.name} war an dem Tag schon abgelaufen.`);
  }
  await db.insert(beeTreatmentsTable).values({
    farmId,
    colonyId,
    date,
    method: input.method,
    medicineId: medicine?.id ?? null,
    product: text(input.product, 100, 'Das Mittel') ?? medicine?.name ?? null,
    dose,
    unit: medicine?.unit ?? null,
    batch: medicine?.batch ?? null,
    notes: text(input.notes, 500, 'Die Notiz'),
  });
  if (medicine && dose) await adjustStock(farmId, medicine.id, -dose);
  return colonyDetail(farmId, colonyId);
}

export interface HoneyInput {
  date: unknown;
  amountKg: number;
  note?: unknown;
}

/** Honey goes to Ertrag & Bilanz, with the colony it came from. */
export async function addHoney(farmId: number, colonyId: number, input: HoneyInput) {
  await colonyOf(farmId, colonyId);
  await db.insert(farmYieldsTable).values({
    farmId,
    colonyId,
    product: 'honey',
    date: validDate(input.date, 'Datum'),
    amount: kg(input.amountKg, 500, 'Die Menge', true),
    note: text(input.note, 200, 'Die Notiz'),
    // Bio (docs/bio.md, B7): fixed when entered.
    organic: certified((await getFarming(farmId)).level),
  });
  return colonyDetail(farmId, colonyId);
}

export type BeeEntryKind = 'inspections' | 'feedings' | 'treatments' | 'honey';

/** Deletes one entry of the hive card; a treatment gives its dose back to the stock. */
export async function deleteEntry(farmId: number, colonyId: number, kind: BeeEntryKind, entryId: number) {
  await colonyOf(farmId, colonyId);
  let deleted: unknown[] = [];
  if (kind === 'inspections') {
    deleted = await db.delete(beeInspectionsTable).where(and(eq(beeInspectionsTable.id, entryId), eq(beeInspectionsTable.colonyId, colonyId))).returning();
  } else if (kind === 'feedings') {
    deleted = await db.delete(beeFeedingsTable).where(and(eq(beeFeedingsTable.id, entryId), eq(beeFeedingsTable.colonyId, colonyId))).returning();
  } else if (kind === 'treatments') {
    const rows = await db.delete(beeTreatmentsTable).where(and(eq(beeTreatmentsTable.id, entryId), eq(beeTreatmentsTable.colonyId, colonyId))).returning();
    for (const t of rows) if (t.medicineId !== null && t.dose) await adjustStock(farmId, t.medicineId, t.dose);
    deleted = rows;
  } else {
    deleted = await db
      .delete(farmYieldsTable)
      .where(and(eq(farmYieldsTable.id, entryId), eq(farmYieldsTable.colonyId, colonyId), eq(farmYieldsTable.product, 'honey')))
      .returning();
  }
  if (deleted.length === 0) throw notFound();
  return colonyDetail(farmId, colonyId);
}

// ── Morning push ─────────────────────────────────────────────────────────────

export async function sendBeeDigests(hhmm: string, day: string): Promise<number> {
  if (hhmm < BEE_PUSH_TIME) return 0;
  let sent = 0;
  try {
    const farms = await db.selectDistinct({ farmId: beeColoniesTable.farmId }).from(beeColoniesTable).where(eq(beeColoniesTable.status, 'active'));
    if (farms.length === 0) return 0;
    await db.delete(farmPushLogTable).where(and(eq(farmPushLogTable.topic, 'bees'), lt(farmPushLogTable.day, addDays(day, -14))));
    for (const { farmId } of farms) {
      try {
        const done = await db
          .select({ day: farmPushLogTable.day })
          .from(farmPushLogTable)
          .where(and(eq(farmPushLogTable.farmId, farmId), eq(farmPushLogTable.topic, 'bees'), gte(farmPushLogTable.day, day)));
        if (done.length > 0) continue;
        const colonies = await db.select().from(beeColoniesTable).where(and(eq(beeColoniesTable.farmId, farmId), eq(beeColoniesTable.status, 'active')));
        const facts = await factsOf(farmId, colonies.map((c) => c.id));
        const lines = pushLines(colonies.map((c) => colonyFacts(c, facts)), day);
        if (lines.length === 0) continue;
        const claimed = await db.insert(farmPushLogTable).values({ farmId, topic: 'bees', day }).onConflictDoNothing().returning();
        if (claimed.length === 0) continue;
        const members = await db
          .select({ userId: farmMembershipsTable.userId })
          .from(farmMembershipsTable)
          .where(and(eq(farmMembershipsTable.farmId, farmId), inArray(farmMembershipsTable.role, ['admin', 'caretaker']), grantedSql('bees')));
        for (const { userId } of members) {
          await sendPushToUser(userId, {
            topic: 'bees',
            title: lines.length === 1 ? 'Bienen: heute dran' : `Bienen: ${lines.length} Dinge heute`,
            body: lines.join(' · '),
            tag: `bees-${farmId}-${day}`,
            url: '/farm/bienen',
          });
        }
        sent += 1;
      } catch (err) {
        logger.warn({ err, farmId }, 'Bee push failed');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Bee pushes failed');
  }
  return sent;
}
