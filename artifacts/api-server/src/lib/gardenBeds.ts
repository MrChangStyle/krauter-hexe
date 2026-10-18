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

import { FarmDataError, MAX_PHOTO_LENGTH, PHOTO_RE, notFound, text } from './farmAnimals';
import { deleteImageByUrl, uploadImage } from './imageStorage';
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
    .returning({ id: gardenBedsTable.id, photoUrl: gardenBedsTable.photoUrl });
  if (deleted.length === 0) throw notFound();
  if (deleted[0]!.photoUrl) void deleteImageByUrl(deleted[0]!.photoUrl).catch(() => false);
}

// ── Foto mit Pflanzraster ────────────────────────────────────────────────────

/** A new photo of the bed; the corners must be marked again on it. */
export async function setBedPhoto(farmId: number, bedId: number, imageData: unknown, heading: number | null | undefined) {
  if (typeof imageData !== 'string' || imageData.length > MAX_PHOTO_LENGTH || !PHOTO_RE.test(imageData)) {
    throw new FarmDataError(400, 'Das ist kein gültiges Foto.');
  }
  const photoHeading = heading == null ? null : Math.round(((heading % 360) + 360) % 360);
  const current = await getBed(farmId, bedId);
  let url: string;
  try {
    url = await uploadImage(imageData);
  } catch {
    throw new FarmDataError(502, 'Das Foto konnte gerade nicht gespeichert werden. Bitte versuche es später erneut.');
  }
  const [bed] = await db
    .update(gardenBedsTable)
    .set({ photoUrl: url, photoHeading, photoCorners: null })
    .where(and(eq(gardenBedsTable.id, bedId), eq(gardenBedsTable.farmId, farmId)))
    .returning();
  if (current.photoUrl && current.photoUrl !== url) void deleteImageByUrl(current.photoUrl).catch(() => false);
  if (!bed) throw notFound();
  return bed;
}

export async function removeBedPhoto(farmId: number, bedId: number) {
  const current = await getBed(farmId, bedId);
  const [bed] = await db
    .update(gardenBedsTable)
    .set({ photoUrl: null, photoHeading: null, photoCorners: null })
    .where(and(eq(gardenBedsTable.id, bedId), eq(gardenBedsTable.farmId, farmId)))
    .returning();
  if (current.photoUrl) void deleteImageByUrl(current.photoUrl).catch(() => false);
  return bed!;
}

type Point = { x: number; y: number };

/** Four points inside the photo forming a convex quadrilateral (in order). */
export function validCorners(corners: Point[]): boolean {
  if (corners.length !== 4) return false;
  if (corners.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return false;
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    const c = corners[(i + 2) % 4]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-4) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

export async function setBedCorners(farmId: number, bedId: number, corners: Point[]) {
  const current = await getBed(farmId, bedId);
  if (!current.photoUrl) throw new FarmDataError(400, 'Für dieses Beet gibt es noch kein Foto.');
  if (!validCorners(corners)) {
    throw new FarmDataError(400, 'Die vier Ecken ergeben kein Viereck – bitte der Reihe nach rund ums Beet antippen.');
  }
  const rounded = corners.map((p) => ({ x: Math.round(p.x * 10_000) / 10_000, y: Math.round(p.y * 10_000) / 10_000 }));
  const [bed] = await db
    .update(gardenBedsTable)
    .set({ photoCorners: rounded })
    .where(and(eq(gardenBedsTable.id, bedId), eq(gardenBedsTable.farmId, farmId)))
    .returning();
  return bed!;
}
