/**
 * Beds of a farm (Beet-Architekt, step 1). Same rules as the animals: every
 * function takes the farmId from requireFarm and filters by it.
 */

import {
  db,
  gardenBedsTable,
  type BedOrientation,
  type BedType,
  type SoilTexture,
  type WindProtection,
} from '@workspace/db';
import { and, asc, eq } from 'drizzle-orm';

import { FarmDataError, notFound, text } from './farmAnimals';
import { geocodePostalCode, refreshBedFrostDates, roundCoord } from './gardenClimate';
import { logger } from './logger';

export const MAX_BEDS_PER_FARM = 50;

export interface BedInput {
  name: unknown;
  type: BedType;
  lengthCm: number;
  widthCm: number;
  heightCm?: number | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  sunHours?: number | null;
  orientation?: BedOrientation | null;
  windProtection?: WindProtection | null;
  soilTexture?: SoilTexture | null;
  soilPh?: number | null;
  /** Own frost dates; null hands them back to the weather history. */
  frostDates?: { lastFrost: string; firstFrost: string } | null;
  notes?: unknown;
}

function int(value: number | null | undefined, min: number, max: number, message: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < min || value > max) throw new FarmDataError(400, message);
  return value;
}

/** MM-DD of a real day (29.02. excluded). */
export function validMonthDay(raw: string): boolean {
  const match = /^(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return false;
  const [mo, d] = [Number(match[1]), Number(match[2])];
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= days[mo - 1]!;
}

async function bedValues(input: BedInput, previous?: { postalCode: string | null; latitude: number | null; longitude: number | null }) {
  const lengthCm = int(input.lengthCm, 20, 10_000, 'Die Länge muss zwischen 20 cm und 100 m liegen.')!;
  const widthCm = int(input.widthCm, 20, 2_000, 'Die Breite muss zwischen 20 cm und 20 m liegen.')!;
  const postalCode = input.postalCode?.trim() || null;
  if (postalCode && !/^\d{5}$/.test(postalCode)) throw new FarmDataError(400, 'Die Postleitzahl hat fünf Ziffern.');
  const ph = input.soilPh ?? null;
  if (ph !== null && (!Number.isFinite(ph) || ph < 3 || ph > 10)) {
    throw new FarmDataError(400, 'Der pH-Wert muss zwischen 3 und 10 liegen.');
  }

  // Location: the phone's position wins; else the postal code (looked up
  // only when it changed); without either, none.
  let latitude: number | null = null;
  let longitude: number | null = null;
  const lat = input.latitude ?? null;
  const lon = input.longitude ?? null;
  if (lat !== null && lon !== null) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new FarmDataError(400, 'Der Standort ist ungültig.');
    }
    latitude = roundCoord(lat);
    longitude = roundCoord(lon);
  } else if (postalCode) {
    if (previous && previous.postalCode === postalCode && previous.latitude !== null) {
      latitude = previous.latitude;
      longitude = previous.longitude;
    } else {
      const found = await geocodePostalCode(postalCode);
      latitude = found?.latitude ?? null;
      longitude = found?.longitude ?? null;
    }
  }

  const values = {
    name: text(input.name, 60, 'Der Name', true),
    type: input.type,
    lengthCm,
    widthCm,
    heightCm: int(input.heightCm, 0, 300, 'Die Höhe muss zwischen 0 und 300 cm liegen.'),
    postalCode,
    latitude,
    longitude,
    sunHours: int(input.sunHours, 0, 16, 'Die Sonnenstunden liegen zwischen 0 und 16.'),
    orientation: input.orientation ?? null,
    windProtection: input.windProtection ?? null,
    soilTexture: input.soilTexture ?? null,
    soilPh: ph === null ? null : Math.round(ph * 10) / 10,
    notes: text(input.notes, 2000, 'Die Notiz'),
  };

  if (input.frostDates === undefined) return { values, frost: undefined };
  if (input.frostDates === null) {
    return { values, frost: { lastFrost: '05-15', firstFrost: '10-15', frostSource: 'default' as const } };
  }
  const { lastFrost, firstFrost } = input.frostDates;
  if (!validMonthDay(lastFrost) || !validMonthDay(firstFrost)) {
    throw new FarmDataError(400, 'Bitte gib die Frosttermine als Tag und Monat an.');
  }
  if (lastFrost >= firstFrost) throw new FarmDataError(400, 'Der letzte Frost muss vor dem ersten Herbstfrost liegen.');
  return { values, frost: { lastFrost, firstFrost, frostSource: 'manual' as const } };
}

/** After a save: look up frost dates for the location, in the background. */
function scheduleFrostDates(bed: { id: number; latitude: number | null; longitude: number | null; frostSource: string }) {
  if (bed.latitude === null || bed.longitude === null || bed.frostSource !== 'default') return;
  void refreshBedFrostDates(bed.id, bed.latitude, bed.longitude).catch((err: unknown) =>
    logger.warn({ err }, 'Frost dates failed'),
  );
}

export async function listBeds(farmId: number) {
  return db
    .select()
    .from(gardenBedsTable)
    .where(eq(gardenBedsTable.farmId, farmId))
    .orderBy(asc(gardenBedsTable.name), asc(gardenBedsTable.id));
}

export async function getBed(farmId: number, bedId: number) {
  const [bed] = await db
    .select()
    .from(gardenBedsTable)
    .where(and(eq(gardenBedsTable.farmId, farmId), eq(gardenBedsTable.id, bedId)));
  if (!bed) throw notFound();
  return bed;
}

export async function createBed(farmId: number, input: BedInput) {
  const existing = await listBeds(farmId);
  if (existing.length >= MAX_BEDS_PER_FARM) {
    throw new FarmDataError(400, `Eine Farm kann höchstens ${MAX_BEDS_PER_FARM} Beete haben.`);
  }
  const { values, frost } = await bedValues(input);
  const [bed] = await db
    .insert(gardenBedsTable)
    .values({ farmId, ...values, ...(frost ?? {}) })
    .returning();
  scheduleFrostDates(bed!);
  return bed!;
}

export async function updateBed(farmId: number, bedId: number, input: BedInput) {
  const previous = await getBed(farmId, bedId);
  const { values, frost } = await bedValues(input, previous);
  // A new place means new weather – unless the user set the dates by hand.
  const moved = values.latitude !== previous.latitude || values.longitude !== previous.longitude;
  const frostReset =
    frost ?? (moved && previous.frostSource === 'climate' ? { lastFrost: '05-15', firstFrost: '10-15', frostSource: 'default' as const } : {});
  const [bed] = await db
    .update(gardenBedsTable)
    .set({ ...values, ...frostReset })
    .where(and(eq(gardenBedsTable.id, bedId), eq(gardenBedsTable.farmId, farmId)))
    .returning();
  if (!bed) throw notFound();
  scheduleFrostDates(bed);
  return bed;
}

export async function deleteBed(farmId: number, bedId: number): Promise<void> {
  const deleted = await db
    .delete(gardenBedsTable)
    .where(and(eq(gardenBedsTable.id, bedId), eq(gardenBedsTable.farmId, farmId)))
    .returning({ id: gardenBedsTable.id });
  if (deleted.length === 0) throw notFound();
}
