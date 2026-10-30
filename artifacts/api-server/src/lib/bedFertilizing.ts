/**
 * Düngung (docs/bio.md, B7): what went onto a bed and when. Every farm can
 * log it; on organic farms mineral fertiliser turns the Bio-Check red and the
 * log goes into the Bio-Dokumentation.
 */

import { FERTILIZER_KINDS, bedFertilizingsTable, db, gardenBedsTable, type FertilizerKind } from '@workspace/db';
import { and, desc, eq } from 'drizzle-orm';

import { FarmDataError, notFound, text, validDate } from './farmAnimals';

const columns = {
  id: bedFertilizingsTable.id,
  bedId: bedFertilizingsTable.bedId,
  bedName: gardenBedsTable.name,
  date: bedFertilizingsTable.date,
  kind: bedFertilizingsTable.kind,
  label: bedFertilizingsTable.label,
  amountKg: bedFertilizingsTable.amountKg,
};

export interface Fertilizing {
  id: number;
  bedId: number;
  bedName: string;
  date: string;
  kind: FertilizerKind;
  label: string | null;
  amountKg: number | null;
}

/** All of the farm's entries, newest first (a few per bed and year – the app filters). */
export async function listFertilizings(farmId: number): Promise<Fertilizing[]> {
  const rows = await db
    .select(columns)
    .from(bedFertilizingsTable)
    .innerJoin(gardenBedsTable, eq(gardenBedsTable.id, bedFertilizingsTable.bedId))
    .where(eq(bedFertilizingsTable.farmId, farmId))
    .orderBy(desc(bedFertilizingsTable.date), desc(bedFertilizingsTable.id));
  return rows as Fertilizing[];
}

export interface FertilizingInput {
  date: unknown;
  kind: string;
  label?: unknown;
  amountKg?: number | null;
}

export async function addFertilizing(farmId: number, bedId: number, input: FertilizingInput): Promise<Fertilizing> {
  const [bed] = await db
    .select({ id: gardenBedsTable.id, name: gardenBedsTable.name })
    .from(gardenBedsTable)
    .where(and(eq(gardenBedsTable.id, bedId), eq(gardenBedsTable.farmId, farmId)));
  if (!bed) throw notFound();
  if (!(FERTILIZER_KINDS as readonly string[]).includes(input.kind)) throw new FarmDataError(400, 'Die Art der Düngung ist ungültig.');
  const date = validDate(input.date, 'Datum der Düngung');
  let amountKg: number | null = null;
  if (input.amountKg !== undefined && input.amountKg !== null) {
    amountKg = Math.round(Number(input.amountKg) * 10) / 10;
    if (!Number.isFinite(amountKg) || amountKg <= 0 || amountKg > 100_000) throw new FarmDataError(400, 'Die Menge liegt zwischen 0,1 kg und 100 t.');
  }
  const [row] = await db
    .insert(bedFertilizingsTable)
    .values({ farmId, bedId, date, kind: input.kind, label: text(input.label, 80, 'Die Bezeichnung'), amountKg })
    .returning();
  return { id: row!.id, bedId, bedName: bed.name, date: row!.date, kind: row!.kind as FertilizerKind, label: row!.label, amountKg: row!.amountKg };
}

export async function removeFertilizing(farmId: number, id: number): Promise<void> {
  const deleted = await db
    .delete(bedFertilizingsTable)
    .where(and(eq(bedFertilizingsTable.id, id), eq(bedFertilizingsTable.farmId, farmId)))
    .returning({ id: bedFertilizingsTable.id });
  if (deleted.length === 0) throw notFound();
}
