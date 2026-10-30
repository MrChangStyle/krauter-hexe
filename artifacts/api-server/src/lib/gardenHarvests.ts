/**
 * Ernten: what each planting brought, for the kitchen or as fodder. The
 * Garten-Assistent learns its yields per m² from the latest season with
 * harvests (spec: "Eingetragene Ernten verbessern den Plan im Folgejahr").
 */

import { BED_CELL_CM, bedPlantingsTable, db, harvestLogsTable, type HarvestUse } from '@workspace/db';
import { and, desc, eq, lte, max } from 'drizzle-orm';

import { FarmDataError, notFound, text } from './farmAnimals';
import { validMonthDay } from './gardenBeds';
import { validSeason } from './gardenPlanner';
import { certified, getFarming } from './farming';

const CELL_M2 = (BED_CELL_CM * BED_CELL_CM) / 10_000;

const columns = {
  id: harvestLogsTable.id,
  plantingId: harvestLogsTable.plantingId,
  bedId: harvestLogsTable.bedId,
  season: harvestLogsTable.season,
  cropKey: harvestLogsTable.cropKey,
  label: harvestLogsTable.label,
  cells: harvestLogsTable.cells,
  harvestedOn: harvestLogsTable.harvestedOn,
  amountKg: harvestLogsTable.amountKg,
  use: harvestLogsTable.use,
  note: harvestLogsTable.note,
  organic: harvestLogsTable.organic,
};

export type Harvest = { [K in keyof typeof columns]: (typeof harvestLogsTable.$inferSelect)[K] };

export async function listHarvests(farmId: number, season: number): Promise<Harvest[]> {
  return db
    .select(columns)
    .from(harvestLogsTable)
    .where(and(eq(harvestLogsTable.farmId, farmId), eq(harvestLogsTable.season, validSeason(season))))
    .orderBy(desc(harvestLogsTable.harvestedOn), desc(harvestLogsTable.id));
}

export interface HarvestInput {
  harvestedOn: string;
  amountKg: number;
  use: HarvestUse;
  note?: unknown;
}

export async function addHarvest(farmId: number, plantingId: number, input: HarvestInput): Promise<Harvest> {
  const [planting] = await db
    .select()
    .from(bedPlantingsTable)
    .where(and(eq(bedPlantingsTable.id, plantingId), eq(bedPlantingsTable.farmId, farmId)));
  if (!planting) throw notFound();
  const day = /^(\d{4})-(\d{2}-\d{2})$/.exec(input.harvestedOn);
  if (!day || !validMonthDay(day[2]!) || Math.abs(Number(day[1]) - planting.season) > 1) {
    throw new FarmDataError(400, 'Bitte gib das Erntedatum in der Saison der Pflanzung an.');
  }
  if (input.harvestedOn > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)) {
    throw new FarmDataError(400, 'Das Erntedatum liegt in der Zukunft.');
  }
  const amountKg = Math.round(Number(input.amountKg) * 1000) / 1000;
  if (!Number.isFinite(amountKg) || amountKg <= 0 || amountKg > 1000) throw new FarmDataError(400, 'Die Menge liegt zwischen 1 g und 1000 kg.');
  const [row] = await db
    .insert(harvestLogsTable)
    .values({
      farmId,
      plantingId,
      bedId: planting.bedId,
      season: planting.season,
      cropKey: planting.cropKey,
      label: planting.label,
      cells: planting.w * planting.h,
      harvestedOn: input.harvestedOn,
      amountKg,
      use: input.use,
      note: text(input.note, 300, 'Die Notiz'),
      // Bio (docs/bio.md, B7): fixed when harvested.
      organic: certified((await getFarming(farmId)).level),
    })
    .returning(columns);
  return row!;
}

export async function removeHarvest(farmId: number, harvestId: number): Promise<void> {
  const deleted = await db
    .delete(harvestLogsTable)
    .where(and(eq(harvestLogsTable.id, harvestId), eq(harvestLogsTable.farmId, farmId)))
    .returning({ id: harvestLogsTable.id });
  if (deleted.length === 0) throw notFound();
}

// ── What the harvests teach ──────────────────────────────────────────────────

export interface Yields {
  season: number;
  kitchenKg: number;
  fodderKg: number;
  /** kg per m² of the plantings that were harvested for it; null without area. */
  kitchenKgPerM2: number | null;
  fodderKgPerM2: number | null;
  crops: { cropKey: string | null; label: string; kg: number; m2: number; kgPerM2: number }[];
}

/** Rounds to a step like 0.1 without floating-point leftovers. */
const r = (n: number, step: number) => Math.round(n * (1 / step)) / (1 / step);

/** Sums per use and per crop; each planting's area counts once per use. */
export function yieldsOf(season: number, harvests: Pick<Harvest, 'plantingId' | 'id' | 'cropKey' | 'label' | 'cells' | 'amountKg' | 'use'>[]): Yields {
  const kg = { kitchen: 0, fodder: 0 };
  const area = { kitchen: new Map<string, number>(), fodder: new Map<string, number>() };
  const crops = new Map<string, { cropKey: string | null; label: string; kg: number; plantings: Map<string, number> }>();
  for (const h of harvests) {
    const planting = h.plantingId !== null ? `p${h.plantingId}` : `h${h.id}`;
    kg[h.use] += h.amountKg;
    area[h.use].set(planting, h.cells * CELL_M2);
    const key = h.cropKey ?? `label:${h.label}`;
    const crop = crops.get(key) ?? { cropKey: h.cropKey, label: h.label, kg: 0, plantings: new Map() };
    crop.kg += h.amountKg;
    crop.plantings.set(planting, h.cells * CELL_M2);
    crops.set(key, crop);
  }
  const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);
  const perM2 = (k: number, m2: number) => (m2 > 0 && k > 0 ? r(k / m2, 0.1) : null);
  return {
    season,
    kitchenKg: r(kg.kitchen, 0.1),
    fodderKg: r(kg.fodder, 0.1),
    kitchenKgPerM2: perM2(kg.kitchen, sum(area.kitchen)),
    fodderKgPerM2: perM2(kg.fodder, sum(area.fodder)),
    crops: [...crops.values()]
      .map((c) => {
        const m2 = r(sum(c.plantings), 0.01);
        return { cropKey: c.cropKey, label: c.label, kg: r(c.kg, 0.1), m2, kgPerM2: r(c.kg / m2, 0.1) };
      })
      .sort((a, b) => b.kgPerM2 - a.kgPerM2),
  };
}

/** Yields of the latest season (up to this one) that has harvests. */
export async function latestYields(farmId: number, upToSeason: number): Promise<Yields | null> {
  const [latest] = await db
    .select({ season: max(harvestLogsTable.season) })
    .from(harvestLogsTable)
    .where(and(eq(harvestLogsTable.farmId, farmId), lte(harvestLogsTable.season, upToSeason)));
  if (!latest?.season) return null;
  return yieldsOf(latest.season, await listHarvests(farmId, latest.season));
}
