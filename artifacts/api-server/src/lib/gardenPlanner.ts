/**
 * Raster-Planer of the Beet-Architekt (step 2): plantings in a bed's 30-cm
 * grid, per season. Fixed rules from the Anbaudaten, no AI: a crop takes as
 * many cells per side as its plant spacing needs; plantings never overlap and
 * stay inside the bed. Neighbour and light hints are shown by the app from
 * the same catalog.
 */

import { BED_CELL_CM, bedPlantingsTable, db, gardenBedsTable, plantsTable } from '@workspace/db';
import { and, asc, eq, sql } from 'drizzle-orm';

import { FarmDataError, notFound } from './farmAnimals';
import { speciesKey } from './speciesKey';
import { cropByKey, fullCatalog, type Crop } from './gardenCatalog';
import { loadApprovedCrops } from './gardenCrops';

/** Cells along the bed's length (x) and width (y). */
export function gridSize(bed: { lengthCm: number; widthCm: number }): { cols: number; rows: number } {
  return {
    cols: Math.max(1, Math.floor(bed.lengthCm / BED_CELL_CM)),
    rows: Math.max(1, Math.floor(bed.widthCm / BED_CELL_CM)),
  };
}

/** Cells per side a plant of this crop needs (1 for small ones, at most 5). */
export function footprint(crop: Pick<Crop, 'spacingCm'> | undefined): number {
  if (!crop) return 1;
  return Math.min(5, Math.max(1, Math.ceil(crop.spacingCm / BED_CELL_CM)));
}

type Rect = { x: number; y: number; w: number; h: number };

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The catalog crop for an archive plant, matched by genus and species. */
export function cropForBotanicalName(botanicalName: string): Crop | undefined {
  const key = speciesKey(botanicalName);
  if (!key) return undefined;
  return fullCatalog().find((c) => speciesKey(c.botanicalName) === key);
}

const plantingColumns = {
  id: bedPlantingsTable.id,
  season: bedPlantingsTable.season,
  cropKey: bedPlantingsTable.cropKey,
  plantId: bedPlantingsTable.plantId,
  label: bedPlantingsTable.label,
  x: bedPlantingsTable.x,
  y: bedPlantingsTable.y,
  w: bedPlantingsTable.w,
  h: bedPlantingsTable.h,
};

export function validSeason(season: number): number {
  if (!Number.isInteger(season) || season < 2000 || season > 2100) throw notFound();
  return season;
}

async function bedOf(farmId: number, bedId: number) {
  const [bed] = await db
    .select({ id: gardenBedsTable.id, lengthCm: gardenBedsTable.lengthCm, widthCm: gardenBedsTable.widthCm })
    .from(gardenBedsTable)
    .where(and(eq(gardenBedsTable.id, bedId), eq(gardenBedsTable.farmId, farmId)));
  if (!bed) throw notFound();
  return bed;
}

export async function listPlantings(farmId: number, bedId: number, season: number) {
  await bedOf(farmId, bedId);
  return db
    .select(plantingColumns)
    .from(bedPlantingsTable)
    .where(
      and(
        eq(bedPlantingsTable.farmId, farmId),
        eq(bedPlantingsTable.bedId, bedId),
        eq(bedPlantingsTable.season, validSeason(season)),
      ),
    )
    .orderBy(asc(bedPlantingsTable.y), asc(bedPlantingsTable.x));
}

export interface PlantingInput {
  cropKey?: string | null;
  plantId?: number | null;
  x: number;
  y: number;
}

export async function addPlanting(farmId: number, bedId: number, season: number, input: PlantingInput) {
  validSeason(season);
  await loadApprovedCrops();
  // What is planted: a catalog crop, or an archive plant (matched to the
  // catalog when its species is in it, so the rules apply to it too).
  let crop = input.cropKey ? cropByKey(input.cropKey) : undefined;
  if (input.cropKey && !crop) throw new FarmDataError(400, 'Diese Pflanze kennt der Katalog nicht.');
  let label = crop?.name ?? '';
  let plantId: number | null = null;
  if (input.plantId != null) {
    const [plant] = await db
      .select({ id: plantsTable.id, germanName: plantsTable.germanName, botanicalName: plantsTable.botanicalName })
      .from(plantsTable)
      .where(eq(plantsTable.id, input.plantId));
    if (!plant) throw new FarmDataError(400, 'Diese Pflanze gibt es im Archiv nicht.');
    plantId = plant.id;
    label = plant.germanName;
    crop ??= cropForBotanicalName(plant.botanicalName);
  }
  if (!crop && plantId === null) throw new FarmDataError(400, 'Bitte wähle eine Pflanze.');

  const side = footprint(crop);
  const rect = { x: input.x, y: input.y, w: side, h: side };

  return db.transaction(async (tx) => {
    // One writer per bed at a time, so two taps cannot fill the same cell.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('bed-plantings'), ${bedId})`);
    const [bed] = await tx
      .select({ lengthCm: gardenBedsTable.lengthCm, widthCm: gardenBedsTable.widthCm })
      .from(gardenBedsTable)
      .where(and(eq(gardenBedsTable.id, bedId), eq(gardenBedsTable.farmId, farmId)));
    if (!bed) throw notFound();
    const { cols, rows } = gridSize(bed);
    if (!Number.isInteger(rect.x) || !Number.isInteger(rect.y) || rect.x < 0 || rect.y < 0 || rect.x + side > cols || rect.y + side > rows) {
      throw new FarmDataError(400, side > 1 ? `${label} braucht ${side} × ${side} Felder – so viel Platz ist dort nicht.` : 'Dieses Feld liegt außerhalb des Beetes.');
    }
    const taken = await tx
      .select(plantingColumns)
      .from(bedPlantingsTable)
      .where(and(eq(bedPlantingsTable.farmId, farmId), eq(bedPlantingsTable.bedId, bedId), eq(bedPlantingsTable.season, season)));
    const clash = taken.find((p) => overlaps(p, rect));
    if (clash) throw new FarmDataError(409, `Dort steht schon ${clash.label}.`);
    const [row] = await tx
      .insert(bedPlantingsTable)
      .values({ farmId, bedId, season, cropKey: crop?.key ?? null, plantId, label, ...rect })
      .returning(plantingColumns);
    return row!;
  });
}

/**
 * Verschieben (docs/beet-architekt.md): the same planting to another spot of
 * its bed – it keeps its id, so harvests and checks stay with it. It may
 * overlap its own old spot, never another planting or the edge.
 */
export async function movePlanting(farmId: number, plantingId: number, input: { x: number; y: number }) {
  return db.transaction(async (tx) => {
    const [p] = await tx
      .select({ ...plantingColumns, bedId: bedPlantingsTable.bedId })
      .from(bedPlantingsTable)
      .where(and(eq(bedPlantingsTable.id, plantingId), eq(bedPlantingsTable.farmId, farmId)));
    if (!p) throw notFound();
    // Same lock as adding: two moves cannot take the same cell.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('bed-plantings'), ${p.bedId})`);
    const [bed] = await tx
      .select({ lengthCm: gardenBedsTable.lengthCm, widthCm: gardenBedsTable.widthCm })
      .from(gardenBedsTable)
      .where(and(eq(gardenBedsTable.id, p.bedId), eq(gardenBedsTable.farmId, farmId)));
    if (!bed) throw notFound();
    const { cols, rows } = gridSize(bed);
    const rect = { x: input.x, y: input.y, w: p.w, h: p.h };
    if (!Number.isInteger(rect.x) || !Number.isInteger(rect.y) || rect.x < 0 || rect.y < 0 || rect.x + rect.w > cols || rect.y + rect.h > rows) {
      throw new FarmDataError(400, p.w > 1 ? `${p.label} braucht ${p.w} × ${p.h} Felder – so viel Platz ist dort nicht.` : 'Dieses Feld liegt außerhalb des Beetes.');
    }
    const others = await tx
      .select(plantingColumns)
      .from(bedPlantingsTable)
      .where(and(eq(bedPlantingsTable.farmId, farmId), eq(bedPlantingsTable.bedId, p.bedId), eq(bedPlantingsTable.season, p.season)));
    const clash = others.find((o) => o.id !== p.id && overlaps(o, rect));
    if (clash) throw new FarmDataError(409, `Dort steht schon ${clash.label}.`);
    const [row] = await tx
      .update(bedPlantingsTable)
      .set({ x: rect.x, y: rect.y })
      .where(eq(bedPlantingsTable.id, p.id))
      .returning(plantingColumns);
    return row!;
  });
}

export async function removePlanting(farmId: number, plantingId: number): Promise<void> {
  const deleted = await db
    .delete(bedPlantingsTable)
    .where(and(eq(bedPlantingsTable.id, plantingId), eq(bedPlantingsTable.farmId, farmId)))
    .returning({ id: bedPlantingsTable.id });
  if (deleted.length === 0) throw notFound();
}
