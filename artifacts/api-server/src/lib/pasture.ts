/**
 * Weide (docs/weide.md): the farm's pastures and the grazing diary – which
 * herd grazed where, from when to when, with how many animals. From it: is a
 * pasture grazed, resting (until when) or ready, how many grazing days and
 * animal days per hectare it had this year, and when a herd should move on.
 * Schnitt and Parasiten come from pastureCare.ts. Fixed rules, no AI.
 */

import {
  FARM_SPECIES,
  PASTURE_KINDS,
  db,
  farmAnimalsTable,
  farmMembershipsTable,
  farmPushLogTable,
  herdsTable,
  pastureCutsTable,
  pastureGrazingsTable,
  pasturesTable,
  type FarmSpecies,
  type PastureBoundary,
  type PastureKind,
} from '@workspace/db';
import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';

import { FarmDataError, notFound, text, validDate } from './farmAnimals';
import { grantedSql } from './farmModules';
import { farmLocation, forecast, type DayForecast } from './farmWeather';
import { addDays } from './feedSeason';
import { logger } from './logger';
import { berlinDay } from './monitoring';
import { careHints, mowPlan, mowPushLine, type Cut } from './pastureCare';
import { sendPushToUser } from './webPush';

export const PASTURE_PUSH_TIME = '07:30';

// ── Rules (pure) ──────────────────────────────────────────────────────────────

export interface Grazing {
  id: number;
  pastureId: number;
  herdId: number | null;
  label: string;
  species: FarmSpecies | null;
  animals: number;
  startOn: string;
  endOn: string | null;
  notes: string | null;
}

export interface PastureFacts {
  id: number;
  name: string;
  kind: PastureKind;
  restDays: number;
  maxGrazeDays: number;
  areaHa: number | null;
}

export type PastureStatus = 'grazed' | 'resting' | 'ready';

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const deDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

/** Grazed now, resting until the grass is back, or ready. */
export function pastureState(p: PastureFacts, grazings: Grazing[], today: string) {
  const mine = grazings.filter((g) => g.pastureId === p.id).sort((a, b) => b.startOn.localeCompare(a.startOn) || b.id - a.id);
  const current = mine.find((g) => g.endOn === null || g.endOn >= today) ?? null;
  const last = mine.find((g) => g.endOn !== null && g.endOn < today) ?? null;
  if (current) return { status: 'grazed' as PastureStatus, current, readyOn: null, last };
  const readyOn = last ? addDays(last.endOn!, p.restDays) : null;
  return { status: (readyOn && readyOn > today ? 'resting' : 'ready') as PastureStatus, current: null, readyOn, last };
}

/** Grazing days and animal days within a year (a grazing still running counts up to today). */
export function yearUse(p: PastureFacts, grazings: Grazing[], year: number, today: string) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31` < today ? `${year}-12-31` : today;
  let days = 0;
  let animalDays = 0;
  const covered = new Set<string>();
  for (const g of grazings.filter((x) => x.pastureId === p.id)) {
    const start = g.startOn > from ? g.startOn : from;
    const end = (g.endOn ?? today) < to ? (g.endOn ?? today) : to;
    if (end < start) continue;
    const n = daysBetween(start, end) + 1;
    animalDays += n * g.animals;
    for (let d = start; d <= end; d = addDays(d, 1)) covered.add(d);
  }
  days = covered.size;
  return { grazingDays: days, animalDays, animalDaysPerHa: p.areaHa && p.areaHa > 0 ? Math.round(animalDays / p.areaHa) : null };
}

export interface PastureHint {
  kind: 'too-long' | 'early';
  pastureId: number;
  urgent: boolean;
  text: string;
}

export function pastureHints(p: PastureFacts, grazings: Grazing[], today: string): PastureHint[] {
  const state = pastureState(p, grazings, today);
  const hints: PastureHint[] = [];
  if (state.current) {
    const days = daysBetween(state.current.startOn, today);
    if (days >= p.maxGrazeDays) {
      hints.push({ kind: 'too-long', pastureId: p.id, urgent: days > p.maxGrazeDays + 3, text: `${state.current.label} steht seit ${days} Tagen auf ${p.name} – umtreiben, damit das Gras nachwächst.` });
    }
    const before = grazings
      .filter((g) => g.pastureId === p.id && g.id !== state.current!.id && g.endOn !== null && g.endOn <= state.current!.startOn)
      .sort((a, b) => b.endOn!.localeCompare(a.endOn!))[0];
    const readyOn = before ? addDays(before.endOn!, p.restDays) : null;
    if (readyOn && state.current.startOn < readyOn) {
      hints.push({ kind: 'early', pastureId: p.id, urgent: false, text: `${p.name} sollte noch bis ${deDay(readyOn)} ruhen – zu früh beweidet, wächst schlechter nach.` });
    }
  }
  return hints;
}

/** The morning push: only on the day something comes due. */
export function pushLines(pastures: PastureFacts[], grazings: Grazing[], today: string, cuts: Cut[] = []): string[] {
  const lines: string[] = [];
  for (const p of pastures) {
    const state = pastureState(p, grazings, today);
    if (state.current && daysBetween(state.current.startOn, today) === p.maxGrazeDays) {
      lines.push(`${state.current.label} seit ${p.maxGrazeDays} Tagen auf ${p.name} – umtreiben?`);
    }
    if (!state.current && state.readyOn === today) lines.push(`${p.name} ist wieder bereit`);
    const mow = mowPushLine(p, state.current !== null, grazings, cuts, today);
    if (mow) lines.push(mow);
  }
  return lines;
}

// ── Database ──────────────────────────────────────────────────────────────────

const cutColumns = {
  id: pastureCutsTable.id,
  pastureId: pastureCutsTable.pastureId,
  cutOn: pastureCutsTable.cutOn,
  bales: pastureCutsTable.bales,
  notes: pastureCutsTable.notes,
};

const grazingColumns = {
  id: pastureGrazingsTable.id,
  pastureId: pastureGrazingsTable.pastureId,
  herdId: pastureGrazingsTable.herdId,
  label: pastureGrazingsTable.label,
  species: pastureGrazingsTable.species,
  animals: pastureGrazingsTable.animals,
  startOn: pastureGrazingsTable.startOn,
  endOn: pastureGrazingsTable.endOn,
  notes: pastureGrazingsTable.notes,
};

async function pastureOf(farmId: number, pastureId: number) {
  const [row] = await db
    .select()
    .from(pasturesTable)
    .where(and(eq(pasturesTable.id, pastureId), eq(pasturesTable.farmId, farmId)));
  if (!row) throw notFound();
  return row;
}

// ── Weidekarte ────────────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_378_137;

/**
 * The area of an outline in hectares, on the sphere (the same formula the map
 * uses while drawing, pflanzenscanner lib/pasture-map.ts). Exact enough for
 * fields; the outline is taken as drawn, crossing edges are not checked.
 */
export function boundaryAreaHa(boundary: PastureBoundary): number {
  const rad = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < boundary.length; i++) {
    const [lat1, lng1] = boundary[i]!;
    const [lat2, lng2] = boundary[(i + 1) % boundary.length]!;
    sum += (lng2 - lng1) * rad * (2 + Math.sin(lat1 * rad) + Math.sin(lat2 * rad));
  }
  return Math.abs((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2) / 10_000;
}

/** Checks an outline from the app; null stays null (no outline). */
export function validBoundary(raw: unknown): PastureBoundary | null {
  if (raw === null) return null;
  const invalid = () => new FarmDataError(400, 'Der Umriss ist ungültig.');
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > 100) throw invalid();
  const points = raw.map((point): [number, number] => {
    if (!Array.isArray(point) || point.length !== 2) throw invalid();
    const [lat, lng] = point as unknown[];
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw invalid();
    }
    // About 1 cm – plenty for a field.
    return [Math.round(lat * 1e7) / 1e7, Math.round(lng * 1e7) / 1e7];
  });
  const area = boundaryAreaHa(points);
  if (area < 0.0001) throw new FarmDataError(400, 'Der Umriss hat keine Fläche.');
  if (area > 10_000) throw new FarmDataError(400, 'Der Umriss ist größer als 10.000 ha.');
  return points;
}

export async function pastureOverview(farmId: number, today = berlinDay()) {
  const [pastures, grazings, cuts, herds, location] = await Promise.all([
    db.select().from(pasturesTable).where(eq(pasturesTable.farmId, farmId)).orderBy(asc(pasturesTable.name)),
    db.select(grazingColumns).from(pastureGrazingsTable).where(eq(pastureGrazingsTable.farmId, farmId)).orderBy(desc(pastureGrazingsTable.startOn), desc(pastureGrazingsTable.id)),
    db.select(cutColumns).from(pastureCutsTable).where(eq(pastureCutsTable.farmId, farmId)).orderBy(desc(pastureCutsTable.cutOn), desc(pastureCutsTable.id)),
    db
      .select({ id: herdsTable.id, name: herdsTable.name, species: herdsTable.species, animals: sql<number>`count(${farmAnimalsTable.id})::int` })
      .from(herdsTable)
      .leftJoin(farmAnimalsTable, and(eq(farmAnimalsTable.herdId, herdsTable.id), isNull(farmAnimalsTable.archivedAt)))
      .where(eq(herdsTable.farmId, farmId))
      .groupBy(herdsTable.id)
      .orderBy(asc(herdsTable.name)),
    farmLocation(farmId),
  ]);
  const year = Number(today.slice(0, 4));
  // The forecast only when a cut is due – for the hay weather.
  const mowDue = pastures.some((p) => {
    const plan = !p.archivedAt && mowPlan(p.kind, p.id, grazings, cuts, today);
    return plan && plan.nextCutOn <= today && !pastureState(p, grazings, today).current;
  });
  const days: DayForecast[] = mowDue && location ? await forecast(location.latitude, location.longitude, today) : [];
  const list = pastures.map((p) => {
    const state = pastureState(p, grazings, today);
    const plan = mowPlan(p.kind, p.id, grazings, cuts, today);
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      areaHa: p.areaHa,
      boundary: p.boundary,
      restDays: p.restDays,
      maxGrazeDays: p.maxGrazeDays,
      notes: p.notes,
      archived: p.archivedAt !== null,
      status: state.status,
      current: state.current,
      readyOn: state.readyOn,
      ...yearUse(p, grazings, year, today),
      grazings: grazings.filter((g) => g.pastureId === p.id).slice(0, 10),
      cuts: cuts.filter((c) => c.pastureId === p.id).slice(0, 10),
      nextCutOn: p.archivedAt ? null : (plan?.nextCutOn ?? null),
      cutsThisYear: cuts.filter((c) => c.pastureId === p.id && c.cutOn.startsWith(String(year))).length,
      hints: p.archivedAt ? [] : [...pastureHints(p, grazings, today), ...careHints(p, state.current, grazings, cuts, today, days)],
    };
  });
  const center = location ? { latitude: location.latitude, longitude: location.longitude } : null;
  return { pastures: list, herds, year, center };
}

export interface PastureInput {
  name: unknown;
  kind?: PastureKind;
  areaHa?: number | null;
  boundary?: unknown;
  restDays?: number;
  maxGrazeDays?: number;
  notes?: unknown;
  archived?: boolean;
}

function days(raw: number | undefined, fallback: number, label: string): number {
  if (raw === undefined) return fallback;
  if (!Number.isInteger(raw) || raw < 1 || raw > 365) throw new FarmDataError(400, `${label} liegt zwischen 1 und 365 Tagen.`);
  return raw;
}

/** `boundary` is the outline to store: the input's, or the one kept when the input leaves it out. */
function pastureValues(input: PastureInput, boundary: PastureBoundary | null) {
  const kind = input.kind ?? 'pasture';
  if (!(PASTURE_KINDS as readonly string[]).includes(kind)) throw new FarmDataError(400, 'Diese Nutzung gibt es nicht.');
  // With an outline the area comes from the map, not from the field.
  const areaHa = boundary ? boundaryAreaHa(boundary) : (input.areaHa ?? null);
  if (areaHa !== null && (!Number.isFinite(areaHa) || areaHa <= 0 || areaHa > 10_000)) throw new FarmDataError(400, 'Die Fläche ist ungültig.');
  return {
    name: text(input.name, 60, 'Der Name', true),
    kind,
    areaHa: areaHa === null ? null : Math.round(areaHa * 1000) / 1000,
    boundary,
    restDays: days(input.restDays, 35, 'Die Ruhezeit'),
    maxGrazeDays: days(input.maxGrazeDays, 10, 'Die Weidedauer'),
    notes: text(input.notes, 500, 'Die Notiz'),
    archivedAt: input.archived ? new Date() : null,
  };
}

export async function createPasture(farmId: number, input: PastureInput): Promise<void> {
  await db.insert(pasturesTable).values({ farmId, ...pastureValues(input, input.boundary === undefined ? null : validBoundary(input.boundary)) });
}

export async function updatePasture(farmId: number, pastureId: number, input: PastureInput): Promise<void> {
  const p = await pastureOf(farmId, pastureId);
  const values = pastureValues(input, input.boundary === undefined ? p.boundary : validBoundary(input.boundary));
  // Keep the day it was archived.
  await db
    .update(pasturesTable)
    .set({ ...values, archivedAt: input.archived ? (p.archivedAt ?? new Date()) : null })
    .where(eq(pasturesTable.id, pastureId));
}

export async function deletePasture(farmId: number, pastureId: number): Promise<void> {
  await pastureOf(farmId, pastureId);
  await db.delete(pasturesTable).where(eq(pasturesTable.id, pastureId));
}

export interface GrazingInput {
  herdId?: number | null;
  label?: unknown;
  /** For other animals; a herd brings its own. */
  species?: FarmSpecies | null;
  animals: number;
  startOn: unknown;
  /** Umtreiben: the grazing this herd leaves, ended the day before it arrives here. */
  fromGrazingId?: number | null;
  notes?: unknown;
}

async function grazingOf(farmId: number, grazingId: number) {
  const [row] = await db
    .select(grazingColumns)
    .from(pastureGrazingsTable)
    .where(and(eq(pastureGrazingsTable.id, grazingId), eq(pastureGrazingsTable.farmId, farmId)));
  if (!row) throw notFound();
  return row;
}

/** Auftreiben – or umtreiben, when it comes from another pasture. */
export async function startGrazing(farmId: number, pastureId: number, input: GrazingInput): Promise<void> {
  const pasture = await pastureOf(farmId, pastureId);
  if (pasture.archivedAt) throw new FarmDataError(400, 'Diese Weide wird nicht mehr genutzt.');
  const startOn = validDate(input.startOn, 'Datum');
  if (!Number.isInteger(input.animals) || input.animals < 1 || input.animals > 100_000) throw new FarmDataError(400, 'Die Zahl der Tiere ist ungültig.');
  let label = text(input.label, 60, 'Der Name');
  let species = input.species ?? null;
  if (species !== null && !(FARM_SPECIES as readonly string[]).includes(species)) throw new FarmDataError(400, 'Diese Tierart gibt es nicht.');
  const herdId = input.herdId ?? null;
  if (herdId !== null) {
    const [herd] = await db.select({ name: herdsTable.name, species: herdsTable.species }).from(herdsTable).where(and(eq(herdsTable.id, herdId), eq(herdsTable.farmId, farmId)));
    if (!herd) throw new FarmDataError(400, 'Diese Gruppe gibt es auf der Farm nicht.');
    label = herd.name;
    species = herd.species;
  }
  if (!label) throw new FarmDataError(400, 'Bitte wähle eine Gruppe oder gib einen Namen an.');
  if (input.fromGrazingId != null) {
    const from = await grazingOf(farmId, input.fromGrazingId);
    if (from.endOn !== null) throw new FarmDataError(400, 'Diese Herde ist dort schon abgetrieben.');
    if (from.pastureId === pastureId) throw new FarmDataError(400, 'Die Herde steht schon auf dieser Weide.');
    if (startOn < from.startOn) throw new FarmDataError(400, 'Das Datum liegt vor dem Auftrieb auf der alten Weide.');
    await db.update(pastureGrazingsTable).set({ endOn: startOn > from.startOn ? addDays(startOn, -1) : startOn }).where(eq(pastureGrazingsTable.id, from.id));
  }
  await db.insert(pastureGrazingsTable).values({ farmId, pastureId, herdId, label, species, animals: input.animals, startOn, notes: text(input.notes, 300, 'Die Notiz') });
}

/** Abtreiben: the last day on the pasture. */
export async function endGrazing(farmId: number, grazingId: number, rawEndOn: unknown): Promise<void> {
  const g = await grazingOf(farmId, grazingId);
  const endOn = validDate(rawEndOn, 'Datum');
  if (endOn < g.startOn) throw new FarmDataError(400, 'Das Datum liegt vor dem Auftrieb.');
  await db.update(pastureGrazingsTable).set({ endOn }).where(eq(pastureGrazingsTable.id, grazingId));
}

export async function deleteGrazing(farmId: number, grazingId: number): Promise<void> {
  await grazingOf(farmId, grazingId);
  await db.delete(pastureGrazingsTable).where(eq(pastureGrazingsTable.id, grazingId));
}

// ── Schnitt ──────────────────────────────────────────────────────────────────

export interface CutInput {
  cutOn: unknown;
  bales?: number | null;
  notes?: unknown;
}

/** Gemäht: a cut on any pasture – the plan for Mähweide and Wiese, Weidepflege on the others. */
export async function addCut(farmId: number, pastureId: number, input: CutInput): Promise<void> {
  const pasture = await pastureOf(farmId, pastureId);
  if (pasture.archivedAt) throw new FarmDataError(400, 'Diese Weide wird nicht mehr genutzt.');
  const cutOn = validDate(input.cutOn, 'Datum');
  const bales = input.bales ?? null;
  if (bales !== null && (!Number.isInteger(bales) || bales < 0 || bales > 100_000)) throw new FarmDataError(400, 'Die Zahl der Ballen ist ungültig.');
  await db.insert(pastureCutsTable).values({ farmId, pastureId, cutOn, bales, notes: text(input.notes, 300, 'Die Notiz') });
}

export async function deleteCut(farmId: number, cutId: number): Promise<void> {
  const [gone] = await db
    .delete(pastureCutsTable)
    .where(and(eq(pastureCutsTable.id, cutId), eq(pastureCutsTable.farmId, farmId)))
    .returning({ id: pastureCutsTable.id });
  if (!gone) throw notFound();
}

// ── Morning push ─────────────────────────────────────────────────────────────

export async function sendPastureDigests(hhmm: string, day: string): Promise<number> {
  if (hhmm < PASTURE_PUSH_TIME) return 0;
  let sent = 0;
  try {
    const farms = await db.selectDistinct({ farmId: pasturesTable.farmId }).from(pasturesTable).where(isNull(pasturesTable.archivedAt));
    if (farms.length === 0) return 0;
    await db.delete(farmPushLogTable).where(and(eq(farmPushLogTable.topic, 'pasture'), lt(farmPushLogTable.day, addDays(day, -14))));
    const done = new Set(
      (await db.select({ farmId: farmPushLogTable.farmId }).from(farmPushLogTable).where(and(eq(farmPushLogTable.topic, 'pasture'), eq(farmPushLogTable.day, day)))).map((d) => d.farmId),
    );
    for (const { farmId } of farms.filter((f) => !done.has(f.farmId))) {
      try {
        const [pastures, grazings, cuts] = await Promise.all([
          db.select().from(pasturesTable).where(and(eq(pasturesTable.farmId, farmId), isNull(pasturesTable.archivedAt))),
          db.select(grazingColumns).from(pastureGrazingsTable).where(eq(pastureGrazingsTable.farmId, farmId)),
          db.select(cutColumns).from(pastureCutsTable).where(eq(pastureCutsTable.farmId, farmId)),
        ]);
        const lines = pushLines(pastures, grazings, day, cuts);
        if (lines.length === 0) continue;
        const claimed = await db.insert(farmPushLogTable).values({ farmId, topic: 'pasture', day }).onConflictDoNothing().returning();
        if (claimed.length === 0) continue;
        const members = await db
          .select({ userId: farmMembershipsTable.userId })
          .from(farmMembershipsTable)
          .where(and(eq(farmMembershipsTable.farmId, farmId), inArray(farmMembershipsTable.role, ['admin', 'caretaker']), grantedSql('pasture')));
        for (const { userId } of members) {
          await sendPushToUser(userId, { topic: 'pasture', title: 'Weide', body: lines.join(' · '), tag: `pasture-${farmId}-${day}`, url: '/farm/weide' });
        }
        sent += 1;
      } catch (err) {
        logger.warn({ err, farmId }, 'Pasture push failed');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Pasture pushes failed');
  }
  return sent;
}
