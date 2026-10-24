/**
 * Ernte-Auswertung (docs/ernte-auswertung.md): what a garden season brought
 * per crop and per bed – kg, shop value at the farm's prices, kg and € per m²
 * of the harvested plantings – against the seasons before. Fixed rules, no AI.
 *
 * A harvest counts for the season of its planting (as in the Beet-Architekt),
 * not for the calendar year of the harvest day like Ertrag & Bilanz.
 */

import { BED_CELL_CM, db, gardenBedsTable, harvestLogsTable } from '@workspace/db';
import { and, eq, gte, lte } from 'drizzle-orm';

import { priceOf } from './farmYields';
import { cropByKey } from './gardenCatalog';
import { validSeason } from './gardenPlanner';

const CELL_M2 = (BED_CELL_CM * BED_CELL_CM) / 10_000;
/** Seasons shown in the comparison, the chosen one included. */
export const REPORT_YEARS = 5;

export interface ReportHarvest {
  id: number;
  plantingId: number | null;
  bedId: number | null;
  season: number;
  cropKey: string | null;
  label: string;
  cells: number;
  harvestedOn: string;
  amountKg: number;
  use: 'kitchen' | 'fodder';
}

export interface ReportCrop {
  key: string;
  label: string;
  kg: number;
  kitchenKg: number;
  fodderKg: number;
  m2: number;
  kgPerM2: number | null;
  value: number;
  valuePerM2: number | null;
  harvests: number;
  beds: string[];
  previousKg: number | null;
}

export interface ReportBed {
  bedId: number | null;
  name: string;
  kg: number;
  value: number;
  m2: number;
  valuePerM2: number | null;
  crops: string[];
}

export interface HarvestReport {
  season: number;
  seasons: number[];
  kg: number;
  kitchenKg: number;
  fodderKg: number;
  value: number;
  previous: { kg: number; value: number } | null;
  months: number[];
  years: { season: number; kg: number; value: number }[];
  crops: ReportCrop[];
  beds: ReportBed[];
  best: { label: string; valuePerM2: number }[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const cropKeyOf = (h: Pick<ReportHarvest, 'cropKey' | 'label'>) => h.cropKey ?? `label:${h.label.trim().toLowerCase()}`;
const plantingOf = (h: Pick<ReportHarvest, 'plantingId' | 'id'>) => (h.plantingId !== null ? `p${h.plantingId}` : `h${h.id}`);

/** € of one harvest: kitchen at the crop's price, fodder at bought-in fodder. */
export function harvestValue(h: Pick<ReportHarvest, 'cropKey' | 'amountKg' | 'use'>, price: (key: string) => number): number {
  return h.amountKg * (h.use === 'fodder' ? price('fodder') : price(h.cropKey ? `crop:${h.cropKey}` : 'crop:other'));
}

/**
 * The report for `season` from the harvests of that season and the ones
 * before. A planting's area (its cells when harvested) counts once, however
 * often it was harvested.
 */
export function harvestReport(
  season: number,
  harvests: ReportHarvest[],
  bedNames: Map<number, string>,
  price: (key: string) => number,
): HarvestReport {
  const now = harvests.filter((h) => h.season === season);
  const before = harvests.filter((h) => h.season === season - 1);

  const crops = new Map<string, { label: string; kitchenKg: number; fodderKg: number; value: number; areas: Map<string, number>; harvests: number; beds: Set<string> }>();
  const beds = new Map<string, { bedId: number | null; name: string; kg: number; value: number; areas: Map<string, number>; crops: Map<string, number> }>();
  const months = Array.from({ length: 12 }, () => 0);
  for (const h of now) {
    const value = harvestValue(h, price);
    const label = (h.cropKey && cropByKey(h.cropKey)?.name) || h.label;
    const bedName = h.bedId !== null ? (bedNames.get(h.bedId) ?? 'Gelöschtes Beet') : 'Ohne Beet';
    const crop = crops.get(cropKeyOf(h)) ?? { label, kitchenKg: 0, fodderKg: 0, value: 0, areas: new Map(), harvests: 0, beds: new Set() };
    if (h.use === 'fodder') crop.fodderKg += h.amountKg;
    else crop.kitchenKg += h.amountKg;
    crop.value += value;
    crop.harvests++;
    crop.areas.set(plantingOf(h), h.cells * CELL_M2);
    crop.beds.add(bedName);
    crops.set(cropKeyOf(h), crop);

    const bedKey = h.bedId !== null ? `b${h.bedId}` : 'none';
    const bed = beds.get(bedKey) ?? { bedId: h.bedId, name: bedName, kg: 0, value: 0, areas: new Map(), crops: new Map() };
    bed.kg += h.amountKg;
    bed.value += value;
    bed.areas.set(plantingOf(h), h.cells * CELL_M2);
    bed.crops.set(label, (bed.crops.get(label) ?? 0) + h.amountKg);
    beds.set(bedKey, bed);

    months[Number(h.harvestedOn.slice(5, 7)) - 1]! += h.amountKg;
  }

  const previousKg = new Map<string, number>();
  for (const h of before) previousKg.set(cropKeyOf(h), (previousKg.get(cropKeyOf(h)) ?? 0) + h.amountKg);

  const area = (m: Map<string, number>) => r2([...m.values()].reduce((s, v) => s + v, 0));
  const per = (n: number, m2: number, round: (n: number) => number) => (m2 > 0 ? round(n / m2) : null);

  const cropList: ReportCrop[] = [...crops.entries()]
    .map(([key, c]) => {
      const kg = c.kitchenKg + c.fodderKg;
      const m2 = area(c.areas);
      return {
        key,
        label: c.label,
        kg: r1(kg),
        kitchenKg: r1(c.kitchenKg),
        fodderKg: r1(c.fodderKg),
        m2,
        kgPerM2: per(kg, m2, r1),
        value: r2(c.value),
        valuePerM2: per(c.value, m2, r2),
        harvests: c.harvests,
        beds: [...c.beds].sort((a, b) => a.localeCompare(b, 'de')),
        previousKg: previousKg.has(key) ? r1(previousKg.get(key)!) : null,
      };
    })
    .sort((a, b) => b.value - a.value || b.kg - a.kg);

  const bedList: ReportBed[] = [...beds.values()]
    .map((b) => {
      const m2 = area(b.areas);
      return {
        bedId: b.bedId,
        name: b.name,
        kg: r1(b.kg),
        value: r2(b.value),
        m2,
        valuePerM2: per(b.value, m2, r2),
        crops: [...b.crops.entries()].sort((x, y) => y[1] - x[1]).map(([label]) => label),
      };
    })
    .sort((a, b) => b.value - a.value);

  const seasonsWith = [...new Set(harvests.map((h) => h.season))].sort((a, b) => b - a);
  const years = seasonsWith
    .filter((s) => s <= season && s > season - REPORT_YEARS)
    .sort((a, b) => a - b)
    .map((s) => {
      const of = harvests.filter((h) => h.season === s);
      return { season: s, kg: r1(of.reduce((sum, h) => sum + h.amountKg, 0)), value: r2(of.reduce((sum, h) => sum + harvestValue(h, price), 0)) };
    });

  const kitchenKg = now.filter((h) => h.use === 'kitchen').reduce((s, h) => s + h.amountKg, 0);
  const fodderKg = now.filter((h) => h.use === 'fodder').reduce((s, h) => s + h.amountKg, 0);
  return {
    season,
    seasons: seasonsWith,
    kg: r1(kitchenKg + fodderKg),
    kitchenKg: r1(kitchenKg),
    fodderKg: r1(fodderKg),
    value: r2(cropList.reduce((s, c) => s + c.value, 0)),
    previous: before.length > 0 ? { kg: r1(before.reduce((s, h) => s + h.amountKg, 0)), value: r2(before.reduce((s, h) => s + harvestValue(h, price), 0)) } : null,
    months: months.map(r1),
    years,
    crops: cropList,
    beds: bedList,
    best: cropList
      .filter((c) => c.valuePerM2 !== null && c.value > 0)
      .sort((a, b) => b.valuePerM2! - a.valuePerM2!)
      .slice(0, 3)
      .map((c) => ({ label: c.label, valuePerM2: c.valuePerM2! })),
  };
}

// ── Database ──────────────────────────────────────────────────────────────────

export async function loadHarvestReport(farmId: number, rawSeason: number): Promise<HarvestReport> {
  const season = validSeason(rawSeason);
  const [rows, beds, price, seasons] = await Promise.all([
    db
      .select({
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
      })
      .from(harvestLogsTable)
      .where(and(eq(harvestLogsTable.farmId, farmId), gte(harvestLogsTable.season, season - REPORT_YEARS + 1), lte(harvestLogsTable.season, season))),
    db.select({ id: gardenBedsTable.id, name: gardenBedsTable.name }).from(gardenBedsTable).where(eq(gardenBedsTable.farmId, farmId)),
    priceOf(farmId),
    db.selectDistinct({ season: harvestLogsTable.season }).from(harvestLogsTable).where(eq(harvestLogsTable.farmId, farmId)),
  ]);
  const report = harvestReport(season, rows, new Map(beds.map((b) => [b.id, b.name])), price);
  // The season picker offers every season with harvests, not only the last five.
  return { ...report, seasons: [...new Set([...seasons.map((s) => s.season), season])].sort((a, b) => b - a) };
}
