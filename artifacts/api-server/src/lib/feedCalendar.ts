/**
 * Futterkalender (Futterplaner step 5): which fodder plants from the garden
 * are ready in which month, for the species on the farm – what grows in the
 * beds this season first, the other suitable crops as suggestions. Storable
 * roots and squash are listed again for the winter months, from storage.
 */

import { FARM_SPECIES, bedPlantingsTable, db, farmAnimalsTable, herdsTable, type FarmSpecies } from '@workspace/db';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import { cropByKey } from './gardenCatalog';
import { FODDER_CROPS } from './gardenAssistant';

/** Keep in a cool cellar or clamp through the winter. */
const STORABLE = ['moehre', 'rote_bete', 'pastinake', 'kuerbis'];
const WINTER_MONTHS = [11, 12, 1, 2, 3];

export interface CalendarCrop {
  key: string;
  name: string;
  species: FarmSpecies[];
  /** Grows in the farm's beds this season. */
  planted: boolean;
}

export interface FeedCalendar {
  year: number;
  species: FarmSpecies[];
  months: { month: number; fresh: CalendarCrop[]; stored: CalendarCrop[] }[];
}

function inWindow(window: { from: number; to: number }, month: number): boolean {
  return window.from <= window.to ? month >= window.from && month <= window.to : month >= window.from || month <= window.to;
}

/** Pure, so it can be tested as is. */
export function buildCalendar(year: number, species: FarmSpecies[], planted: Set<string>): FeedCalendar {
  const eaters = species.filter((s) => FODDER_CROPS[s].length > 0);
  const crops = [...new Set(eaters.flatMap((s) => FODDER_CROPS[s]))].flatMap((key): (CalendarCrop & { harvest: { from: number; to: number } })[] => {
    const crop = cropByKey(key);
    return crop ? [{ key, name: crop.name, species: eaters.filter((s) => FODDER_CROPS[s].includes(key)), planted: planted.has(key), harvest: crop.harvest }] : [];
  });
  const sorted = (list: typeof crops) =>
    list.sort((a, b) => Number(b.planted) - Number(a.planted) || a.name.localeCompare(b.name, 'de')).map(({ harvest: _h, ...c }) => c);
  return {
    year,
    species: eaters,
    months: Array.from({ length: 12 }, (_, i) => i + 1).map((month) => ({
      month,
      fresh: sorted(crops.filter((c) => inWindow(c.harvest, month))),
      stored: WINTER_MONTHS.includes(month) ? sorted(crops.filter((c) => STORABLE.includes(c.key) && !inWindow(c.harvest, month))) : [],
    })),
  };
}

export async function feedCalendar(farmId: number, year: number): Promise<FeedCalendar> {
  const animals = await db
    .selectDistinct({ species: farmAnimalsTable.species })
    .from(farmAnimalsTable)
    .where(and(eq(farmAnimalsTable.farmId, farmId), isNull(farmAnimalsTable.archivedAt)));
  const herds = await db.selectDistinct({ species: herdsTable.species }).from(herdsTable).where(eq(herdsTable.farmId, farmId));
  const plantings = await db
    .selectDistinct({ key: bedPlantingsTable.cropKey })
    .from(bedPlantingsTable)
    .where(and(eq(bedPlantingsTable.farmId, farmId), eq(bedPlantingsTable.season, year), isNotNull(bedPlantingsTable.cropKey)));
  const present = new Set([...animals, ...herds].map((a) => a.species));
  const species = FARM_SPECIES.filter((s) => present.has(s));
  return buildCalendar(year, species, new Set(plantings.map((p) => p.key!)));
}
