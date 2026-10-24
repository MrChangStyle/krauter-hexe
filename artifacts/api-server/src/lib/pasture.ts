/**
 * Weide (docs/weide.md): the farm's pastures and the grazing diary – which
 * herd grazed where, from when to when, with how many animals. From it: is a
 * pasture grazed, resting (until when) or ready, how many grazing days and
 * animal days per hectare it had this year, and when a herd should move on.
 * Fixed rules, no AI.
 */

import {
  PASTURE_KINDS,
  db,
  farmAnimalsTable,
  farmMembershipsTable,
  farmPushLogTable,
  herdsTable,
  pastureGrazingsTable,
  pasturesTable,
  type PastureKind,
} from '@workspace/db';
import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';

import { FarmDataError, notFound, text, validDate } from './farmAnimals';
import { grantedSql } from './farmModules';
import { addDays } from './feedSeason';
import { logger } from './logger';
import { berlinDay } from './monitoring';
import { sendPushToUser } from './webPush';

export const PASTURE_PUSH_TIME = '07:30';

// ── Rules (pure) ──────────────────────────────────────────────────────────────

export interface Grazing {
  id: number;
  pastureId: number;
  herdId: number | null;
  label: string;
  animals: number;
  startOn: string;
  endOn: string | null;
  notes: string | null;
}

export interface PastureFacts {
  id: number;
  name: string;
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
export function pushLines(pastures: PastureFacts[], grazings: Grazing[], today: string): string[] {
  const lines: string[] = [];
  for (const p of pastures) {
    const state = pastureState(p, grazings, today);
    if (state.current && daysBetween(state.current.startOn, today) === p.maxGrazeDays) {
      lines.push(`${state.current.label} seit ${p.maxGrazeDays} Tagen auf ${p.name} – umtreiben?`);
    }
    if (!state.current && state.readyOn === today) lines.push(`${p.name} ist wieder bereit`);
  }
  return lines;
}

// ── Database ──────────────────────────────────────────────────────────────────

const grazingColumns = {
  id: pastureGrazingsTable.id,
  pastureId: pastureGrazingsTable.pastureId,
  herdId: pastureGrazingsTable.herdId,
  label: pastureGrazingsTable.label,
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

export async function pastureOverview(farmId: number, today = berlinDay()) {
  const [pastures, grazings, herds] = await Promise.all([
    db.select().from(pasturesTable).where(eq(pasturesTable.farmId, farmId)).orderBy(asc(pasturesTable.name)),
    db.select(grazingColumns).from(pastureGrazingsTable).where(eq(pastureGrazingsTable.farmId, farmId)).orderBy(desc(pastureGrazingsTable.startOn), desc(pastureGrazingsTable.id)),
    db
      .select({ id: herdsTable.id, name: herdsTable.name, species: herdsTable.species, animals: sql<number>`count(${farmAnimalsTable.id})::int` })
      .from(herdsTable)
      .leftJoin(farmAnimalsTable, and(eq(farmAnimalsTable.herdId, herdsTable.id), isNull(farmAnimalsTable.archivedAt)))
      .where(eq(herdsTable.farmId, farmId))
      .groupBy(herdsTable.id)
      .orderBy(asc(herdsTable.name)),
  ]);
  const year = Number(today.slice(0, 4));
  const list = pastures.map((p) => {
    const state = pastureState(p, grazings, today);
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      areaHa: p.areaHa,
      restDays: p.restDays,
      maxGrazeDays: p.maxGrazeDays,
      notes: p.notes,
      archived: p.archivedAt !== null,
      status: state.status,
      current: state.current,
      readyOn: state.readyOn,
      ...yearUse(p, grazings, year, today),
      grazings: grazings.filter((g) => g.pastureId === p.id).slice(0, 10),
      hints: p.archivedAt ? [] : pastureHints(p, grazings, today),
    };
  });
  return { pastures: list, herds, year };
}

export interface PastureInput {
  name: unknown;
  kind?: PastureKind;
  areaHa?: number | null;
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

function pastureValues(input: PastureInput) {
  const kind = input.kind ?? 'pasture';
  if (!(PASTURE_KINDS as readonly string[]).includes(kind)) throw new FarmDataError(400, 'Diese Nutzung gibt es nicht.');
  const areaHa = input.areaHa ?? null;
  if (areaHa !== null && (!Number.isFinite(areaHa) || areaHa <= 0 || areaHa > 10_000)) throw new FarmDataError(400, 'Die Fläche ist ungültig.');
  return {
    name: text(input.name, 60, 'Der Name', true),
    kind,
    areaHa: areaHa === null ? null : Math.round(areaHa * 1000) / 1000,
    restDays: days(input.restDays, 35, 'Die Ruhezeit'),
    maxGrazeDays: days(input.maxGrazeDays, 10, 'Die Weidedauer'),
    notes: text(input.notes, 500, 'Die Notiz'),
    archivedAt: input.archived ? new Date() : null,
  };
}

export async function createPasture(farmId: number, input: PastureInput): Promise<void> {
  await db.insert(pasturesTable).values({ farmId, ...pastureValues(input) });
}

export async function updatePasture(farmId: number, pastureId: number, input: PastureInput): Promise<void> {
  const p = await pastureOf(farmId, pastureId);
  const values = pastureValues(input);
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
  const herdId = input.herdId ?? null;
  if (herdId !== null) {
    const [herd] = await db.select({ name: herdsTable.name }).from(herdsTable).where(and(eq(herdsTable.id, herdId), eq(herdsTable.farmId, farmId)));
    if (!herd) throw new FarmDataError(400, 'Diese Gruppe gibt es auf der Farm nicht.');
    label = herd.name;
  }
  if (!label) throw new FarmDataError(400, 'Bitte wähle eine Gruppe oder gib einen Namen an.');
  if (input.fromGrazingId != null) {
    const from = await grazingOf(farmId, input.fromGrazingId);
    if (from.endOn !== null) throw new FarmDataError(400, 'Diese Herde ist dort schon abgetrieben.');
    if (from.pastureId === pastureId) throw new FarmDataError(400, 'Die Herde steht schon auf dieser Weide.');
    if (startOn < from.startOn) throw new FarmDataError(400, 'Das Datum liegt vor dem Auftrieb auf der alten Weide.');
    await db.update(pastureGrazingsTable).set({ endOn: startOn > from.startOn ? addDays(startOn, -1) : startOn }).where(eq(pastureGrazingsTable.id, from.id));
  }
  await db.insert(pastureGrazingsTable).values({ farmId, pastureId, herdId, label, animals: input.animals, startOn, notes: text(input.notes, 300, 'Die Notiz') });
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

// ── Morning push ─────────────────────────────────────────────────────────────

export async function sendPastureDigests(hhmm: string, day: string): Promise<number> {
  if (hhmm < PASTURE_PUSH_TIME) return 0;
  let sent = 0;
  try {
    const farms = await db.selectDistinct({ farmId: pastureGrazingsTable.farmId }).from(pastureGrazingsTable);
    if (farms.length === 0) return 0;
    await db.delete(farmPushLogTable).where(and(eq(farmPushLogTable.topic, 'pasture'), lt(farmPushLogTable.day, addDays(day, -14))));
    const done = new Set(
      (await db.select({ farmId: farmPushLogTable.farmId }).from(farmPushLogTable).where(and(eq(farmPushLogTable.topic, 'pasture'), eq(farmPushLogTable.day, day)))).map((d) => d.farmId),
    );
    for (const { farmId } of farms.filter((f) => !done.has(f.farmId))) {
      try {
        const [pastures, grazings] = await Promise.all([
          db.select().from(pasturesTable).where(and(eq(pasturesTable.farmId, farmId), isNull(pasturesTable.archivedAt))),
          db.select(grazingColumns).from(pastureGrazingsTable).where(eq(pastureGrazingsTable.farmId, farmId)),
        ]);
        const lines = pushLines(pastures, grazings, day);
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
