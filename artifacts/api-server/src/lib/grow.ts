/**
 * Grow (docs/grow.md): access to the add-on, the account's grows, plants and
 * their Tagebuch. Personal data: every query is filtered by the account; a
 * plant or log of someone else is "not found".
 */

import { db, growAccessTable, growChecksTable, growLogsTable, growPlantsTable, growsTable } from '@workspace/db';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { FarmDataError, notFound, text, validDate } from './farmAnimals';
import { addDays } from './feedSeason';
import {
  GROW_ENVIRONMENTS,
  GROW_MEDIA,
  STRAIN_TYPES,
  defaultFlowerWeeks,
  kcangCheck,
  plantPlan,
  type Flowering,
  type GrowEnvironment,
  type GrowMedium,
  type PlantPlan,
  type SeedSex,
  type StrainType,
} from './growPlan';
import { geocodePostalCode, roundCoord } from './gardenClimate';
import type { GrowCheck, GrowCheckKind, HealthResult, TrichomeResult } from './growDiagnosis';
import { berlinDay } from './monitoring';

// ── Access ────────────────────────────────────────────────────────────────────

export type GrowPush = 'off' | 'discreet' | 'full';

/** The module is free for every adult account; the AI is Premium (lib/premium.ts). */
export interface GrowAccess {
  ageConfirmed: boolean;
  adults: number;
  /** Morning push: off, discreet (no grow words on the lock screen) or full. */
  push: GrowPush;
  /** Own electricity tariff in €/kWh for the cost calculator (null: the app's default). */
  kwhPrice: number | null;
}

export async function growAccess(userId: string): Promise<GrowAccess> {
  const [row] = await db.select().from(growAccessTable).where(eq(growAccessTable.userId, userId));
  return {
    ageConfirmed: !!row?.ageConfirmedAt,
    adults: row?.adults ?? 1,
    push: (row?.push as GrowPush | undefined) ?? 'discreet',
    kwhPrice: row?.kwhPrice ?? null,
  };
}

function validAdults(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new FarmDataError(400, 'Bitte 1 bis 10 Erwachsene angeben.');
  return n;
}

/** The account confirms it is at least 18 and says how many adults live in the household. */
export async function confirmAge(userId: string, adults: unknown): Promise<GrowAccess> {
  const n = validAdults(adults);
  await db
    .insert(growAccessTable)
    .values({ userId, ageConfirmedAt: new Date(), adults: n })
    .onConflictDoUpdate({ target: growAccessTable.userId, set: { ageConfirmedAt: new Date(), adults: n } });
  return growAccess(userId);
}

/** Adults in the household and the morning push. */
export async function setGrowSettings(userId: string, input: { adults?: unknown; push?: string; kwhPrice?: number | null }): Promise<GrowAccess> {
  const set: Partial<typeof growAccessTable.$inferInsert> = {};
  if (input.adults !== undefined) set.adults = validAdults(input.adults);
  if (input.push !== undefined) {
    if (!['off', 'discreet', 'full'].includes(input.push)) throw new FarmDataError(400, 'Bitte wähle aus, wie erinnert werden soll.');
    set.push = input.push;
  }
  if (input.kwhPrice !== undefined) {
    const price = input.kwhPrice;
    if (price !== null && (!Number.isFinite(price) || price < 0.05 || price > 2)) throw new FarmDataError(400, 'Der Strompreis liegt zwischen 0,05 und 2 € pro kWh.');
    set.kwhPrice = price === null ? null : Math.round(price * 10000) / 10000;
  }
  if (Object.keys(set).length > 0) await db.update(growAccessTable).set(set).where(eq(growAccessTable.userId, userId));
  return growAccess(userId);
}

/** Owner: who has the module. */
// ── Grows ─────────────────────────────────────────────────────────────────────

type GrowRow = typeof growsTable.$inferSelect;
type PlantRow = typeof growPlantsTable.$inferSelect;

export interface GrowPlant {
  id: number;
  growId: number;
  name: string;
  strain: string | null;
  breeder: string | null;
  strainType: StrainType;
  flowering: Flowering;
  seedSex: SeedSex;
  flowerWeeks: number;
  startedOn: string;
  flipOn: string | null;
  harvestedOn: string | null;
  wetGrams: number | null;
  dryGrams: number | null;
  notes: string | null;
  plan: PlantPlan;
}

export interface Grow {
  id: number;
  name: string;
  environment: GrowEnvironment;
  medium: GrowMedium;
  tentSize: string | null;
  lightType: string | null;
  lightWatts: number | null;
  /** Indoor: fans, filter and the like around the clock. */
  fanWatts: number | null;
  notes: string | null;
  archived: boolean;
  /** Outdoor and greenhouse: where, for the weather. */
  postalCode: string | null;
  hasLocation: boolean;
  plants: GrowPlant[];
}

function toPlant(p: PlantRow, g: GrowRow, today: string): GrowPlant {
  const grow = { environment: g.environment as GrowEnvironment, medium: g.medium as GrowMedium };
  const plant = {
    strainType: p.strainType as StrainType,
    flowering: p.flowering as Flowering,
    seedSex: p.seedSex as SeedSex,
    flowerWeeks: p.flowerWeeks,
    startedOn: p.startedOn,
    flipOn: p.flipOn,
    harvestedOn: p.harvestedOn,
  };
  return {
    id: p.id,
    growId: p.growId,
    name: p.name,
    strain: p.strain,
    breeder: p.breeder,
    ...plant,
    wetGrams: p.wetGrams,
    dryGrams: p.dryGrams,
    notes: p.notes,
    plan: plantPlan(plant, grow, today),
  };
}

function toGrow(g: GrowRow, plants: PlantRow[], today: string): Grow {
  return {
    id: g.id,
    name: g.name,
    environment: g.environment as GrowEnvironment,
    medium: g.medium as GrowMedium,
    tentSize: g.tentSize,
    lightType: g.lightType,
    lightWatts: g.lightWatts,
    fanWatts: g.fanWatts,
    notes: g.notes,
    archived: g.archivedAt !== null,
    postalCode: g.postalCode,
    hasLocation: g.latitude !== null && g.longitude !== null,
    plants: plants.filter((p) => p.growId === g.id).map((p) => toPlant(p, g, today)),
  };
}

export interface GrowOverview {
  grows: Grow[];
  kcang: ReturnType<typeof kcangCheck>;
}

export async function growOverview(userId: string, adults: number, today = berlinDay()): Promise<GrowOverview> {
  const grows = await db.select().from(growsTable).where(eq(growsTable.userId, userId)).orderBy(asc(growsTable.archivedAt), desc(growsTable.createdAt));
  const plants = grows.length
    ? await db.select().from(growPlantsTable).where(inArray(growPlantsTable.growId, grows.map((g) => g.id))).orderBy(asc(growPlantsTable.startedOn), asc(growPlantsTable.id))
    : [];
  const active = new Set(grows.filter((g) => !g.archivedAt).map((g) => g.id));
  const yearAgo = addDays(today, -365);
  const activePlants = plants.filter((p) => active.has(p.growId) && !p.harvestedOn).length;
  const dryLastYear = plants.filter((p) => p.harvestedOn && p.harvestedOn >= yearAgo).reduce((s, p) => s + (p.dryGrams ?? 0), 0);
  return {
    grows: grows.map((g) => toGrow(g, plants, today)),
    kcang: kcangCheck(activePlants, adults, Math.round(dryLastYear)),
  };
}

async function ownGrow(userId: string, growId: number): Promise<GrowRow> {
  const [g] = await db.select().from(growsTable).where(and(eq(growsTable.id, growId), eq(growsTable.userId, userId)));
  if (!g) throw notFound();
  return g;
}

export interface GrowInput {
  name: unknown;
  environment: string;
  medium: string;
  tentSize?: unknown;
  lightType?: unknown;
  lightWatts?: number | null;
  /** Not sent: stays as it is. */
  fanWatts?: number | null;
  notes?: unknown;
  archived?: boolean;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Where an outdoor grow is: the phone's position wins, else the postal code
 * (both rounded to about 10 km). Not sent at all: stays as it is.
 */
async function growLocation(input: GrowInput, current: GrowRow | null) {
  if (input.environment === 'indoor') return { postalCode: null, latitude: null, longitude: null };
  if (input.postalCode === undefined && input.latitude === undefined && input.longitude === undefined) {
    return current ? {} : { postalCode: null, latitude: null, longitude: null };
  }
  const lat = input.latitude ?? null;
  const lon = input.longitude ?? null;
  const postalCode = input.postalCode?.trim() || null;
  if (lat !== null && lon !== null) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new FarmDataError(400, 'Der Standort ist ungültig.');
    return { postalCode, latitude: roundCoord(lat), longitude: roundCoord(lon) };
  }
  if (!postalCode) return { postalCode: null, latitude: null, longitude: null };
  if (!/^\d{5}$/.test(postalCode)) throw new FarmDataError(400, 'Die Postleitzahl hat fünf Ziffern.');
  // Unchanged postal code: keep the place, no new lookup.
  if (current && current.postalCode === postalCode && current.latitude !== null) {
    return { postalCode, latitude: current.latitude, longitude: current.longitude };
  }
  const found = await geocodePostalCode(postalCode);
  if (!found) throw new FarmDataError(422, 'Zu dieser Postleitzahl wurde kein Ort gefunden.');
  return { postalCode, ...found };
}

function growValues(input: GrowInput) {
  if (!(GROW_ENVIRONMENTS as string[]).includes(input.environment)) throw new FarmDataError(400, 'Bitte wähle Indoor, Outdoor oder Gewächshaus.');
  if (!(GROW_MEDIA as string[]).includes(input.medium)) throw new FarmDataError(400, 'Bitte wähle Erde, Kokos oder Hydro.');
  const watts = input.lightWatts ?? null;
  if (watts !== null && (!Number.isInteger(watts) || watts < 1 || watts > 5000)) throw new FarmDataError(400, 'Die Lampenleistung liegt zwischen 1 und 5000 W.');
  const fans = input.fanWatts;
  if (fans != null && (!Number.isInteger(fans) || fans < 1 || fans > 2000)) throw new FarmDataError(400, 'Lüfter und Filter liegen zwischen 1 und 2000 W.');
  const indoor = input.environment === 'indoor';
  return {
    name: text(input.name, 60, 'Der Name', true),
    environment: input.environment,
    medium: input.medium,
    tentSize: indoor ? text(input.tentSize, 30, 'Die Zeltgröße') : null,
    lightType: indoor ? text(input.lightType, 30, 'Die Lampe') : null,
    lightWatts: indoor ? watts : null,
    ...(fans === undefined && indoor ? {} : { fanWatts: indoor ? fans : null }),
    notes: text(input.notes, 2000, 'Die Notiz'),
    ...(input.archived === undefined ? {} : { archivedAt: input.archived ? new Date() : null }),
  };
}

export async function createGrow(userId: string, input: GrowInput): Promise<number> {
  const [g] = await db.insert(growsTable).values({ userId, ...growValues(input), ...(await growLocation(input, null)) }).returning({ id: growsTable.id });
  return g!.id;
}

export async function updateGrow(userId: string, growId: number, input: GrowInput): Promise<void> {
  const current = await ownGrow(userId, growId);
  const set = { ...growValues(input), ...(await growLocation(input, current)) };
  if (input.archived && current.archivedAt) delete (set as { archivedAt?: Date }).archivedAt;
  await db.update(growsTable).set(set).where(eq(growsTable.id, growId));
}

export async function deleteGrow(userId: string, growId: number): Promise<void> {
  await ownGrow(userId, growId);
  await db.delete(growsTable).where(eq(growsTable.id, growId));
}

// ── Plants ────────────────────────────────────────────────────────────────────

export interface PlantInput {
  name: unknown;
  strain?: unknown;
  breeder?: unknown;
  strainType: string;
  flowering: string;
  seedSex?: string;
  flowerWeeks?: number | null;
  startedOn: unknown;
  flipOn?: string | null;
  harvestedOn?: string | null;
  wetGrams?: number | null;
  dryGrams?: number | null;
  notes?: unknown;
}

function grams(raw: number | null | undefined, label: string): number | null {
  if (raw == null) return null;
  if (!Number.isFinite(raw) || raw < 0 || raw > 100_000) throw new FarmDataError(400, `${label} ist ungültig.`);
  return Math.round(raw * 10) / 10;
}

function plantValues(input: PlantInput) {
  if (!(STRAIN_TYPES as string[]).includes(input.strainType)) throw new FarmDataError(400, 'Bitte wähle Indica, Sativa, Hybrid oder Ruderalis.');
  if (input.flowering !== 'photo' && input.flowering !== 'auto') throw new FarmDataError(400, 'Bitte wähle photoperiodisch oder Autoflower.');
  const seedSex = input.seedSex ?? 'unknown';
  if (!['feminized', 'regular', 'unknown'].includes(seedSex)) throw new FarmDataError(400, 'Bitte wähle feminisiert, regulär oder unbekannt.');
  const flowerWeeks = input.flowerWeeks ?? defaultFlowerWeeks(input.strainType as StrainType, input.flowering as Flowering);
  if (!Number.isInteger(flowerWeeks) || flowerWeeks < 5 || flowerWeeks > 16) throw new FarmDataError(400, 'Die Blütezeit liegt zwischen 5 und 16 Wochen.');
  const startedOn = validDate(input.startedOn, 'Keimdatum');
  const flipOn = input.flipOn ? validDate(input.flipOn, 'Datum der Umstellung auf 12/12') : null;
  if (flipOn && flipOn <= startedOn) throw new FarmDataError(400, 'Die Umstellung auf 12/12 liegt nach dem Keimen.');
  const harvestedOn = input.harvestedOn ? validDate(input.harvestedOn, 'Erntedatum') : null;
  if (harvestedOn && harvestedOn <= startedOn) throw new FarmDataError(400, 'Die Ernte liegt nach dem Keimen.');
  return {
    name: text(input.name, 60, 'Der Name', true),
    strain: text(input.strain, 60, 'Die Sorte'),
    breeder: text(input.breeder, 60, 'Der Züchter'),
    strainType: input.strainType,
    flowering: input.flowering,
    seedSex,
    flowerWeeks,
    startedOn,
    flipOn: input.flowering === 'auto' ? null : flipOn,
    harvestedOn,
    wetGrams: grams(input.wetGrams, 'Das Nassgewicht'),
    dryGrams: grams(input.dryGrams, 'Das Trockengewicht'),
    notes: text(input.notes, 2000, 'Die Notiz'),
  };
}

export async function ownPlant(userId: string, plantId: number): Promise<{ plant: PlantRow; grow: GrowRow }> {
  const [row] = await db
    .select({ plant: growPlantsTable, grow: growsTable })
    .from(growPlantsTable)
    .innerJoin(growsTable, eq(growsTable.id, growPlantsTable.growId))
    .where(and(eq(growPlantsTable.id, plantId), eq(growsTable.userId, userId)));
  if (!row) throw notFound();
  return row;
}

export async function addPlant(userId: string, growId: number, input: PlantInput): Promise<GrowPlant> {
  const grow = await ownGrow(userId, growId);
  if (grow.archivedAt) throw new FarmDataError(409, 'Dieser Grow ist archiviert.');
  const [p] = await db.insert(growPlantsTable).values({ growId, ...plantValues(input) }).returning();
  return toPlant(p!, grow, berlinDay());
}

export async function updatePlant(userId: string, plantId: number, input: PlantInput): Promise<GrowPlant> {
  const { grow } = await ownPlant(userId, plantId);
  const [p] = await db.update(growPlantsTable).set(plantValues(input)).where(eq(growPlantsTable.id, plantId)).returning();
  return toPlant(p!, grow, berlinDay());
}

export async function deletePlant(userId: string, plantId: number): Promise<void> {
  await ownPlant(userId, plantId);
  await db.delete(growPlantsTable).where(eq(growPlantsTable.id, plantId));
}

// ── Tagebuch ──────────────────────────────────────────────────────────────────

export interface GrowLog {
  id: number;
  date: string;
  heightCm: number | null;
  waterMl: number | null;
  ph: number | null;
  ec: number | null;
  note: string | null;
}

export interface PlantDetail {
  plant: GrowPlant;
  grow: { id: number; name: string; environment: GrowEnvironment; medium: GrowMedium };
  logs: GrowLog[];
  /** KI-Checks, newest first (the last 20). */
  checks: GrowCheck[];
}

export async function plantDetail(userId: string, plantId: number, today = berlinDay()): Promise<PlantDetail> {
  const { plant, grow } = await ownPlant(userId, plantId);
  const logs = await db
    .select({ id: growLogsTable.id, date: growLogsTable.date, heightCm: growLogsTable.heightCm, waterMl: growLogsTable.waterMl, ph: growLogsTable.ph, ec: growLogsTable.ec, note: growLogsTable.note })
    .from(growLogsTable)
    .where(eq(growLogsTable.plantId, plantId))
    .orderBy(desc(growLogsTable.date), desc(growLogsTable.id));
  const checks = await db
    .select()
    .from(growChecksTable)
    .where(eq(growChecksTable.plantId, plantId))
    .orderBy(desc(growChecksTable.createdAt), desc(growChecksTable.id))
    .limit(20);
  return {
    plant: toPlant(plant, grow, today),
    grow: { id: grow.id, name: grow.name, environment: grow.environment as GrowEnvironment, medium: grow.medium as GrowMedium },
    logs,
    checks: checks.map((c) => {
      const kind = c.kind as GrowCheckKind;
      return {
        id: c.id,
        kind,
        date: c.date,
        health: kind === 'health' ? (c.result as HealthResult) : null,
        trichomes: kind === 'trichomes' ? (c.result as TrichomeResult) : null,
      };
    }),
  };
}

export async function deleteCheck(userId: string, checkId: number): Promise<void> {
  const [c] = await db.select({ plantId: growChecksTable.plantId }).from(growChecksTable).where(eq(growChecksTable.id, checkId));
  if (!c) throw notFound();
  await ownPlant(userId, c.plantId);
  await db.delete(growChecksTable).where(eq(growChecksTable.id, checkId));
}

export interface LogInput {
  date: unknown;
  heightCm?: number | null;
  waterMl?: number | null;
  ph?: number | null;
  ec?: number | null;
  note?: unknown;
}

function range(raw: number | null | undefined, min: number, max: number, label: string): number | null {
  if (raw == null) return null;
  if (!Number.isFinite(raw) || raw < min || raw > max) throw new FarmDataError(400, `${label} liegt zwischen ${min} und ${max}.`);
  return raw;
}

export async function addLog(userId: string, plantId: number, input: LogInput): Promise<void> {
  const { plant } = await ownPlant(userId, plantId);
  const date = validDate(input.date, 'Datum');
  if (date < plant.startedOn) throw new FarmDataError(400, 'Das Datum liegt vor dem Keimen.');
  const values = {
    heightCm: range(input.heightCm, 0, 500, 'Die Höhe (cm)'),
    waterMl: range(input.waterMl, 0, 50_000, 'Die Wassermenge (ml)'),
    ph: range(input.ph, 3, 10, 'Der pH-Wert'),
    ec: range(input.ec, 0, 6, 'Der EC-Wert'),
    note: text(input.note, 1000, 'Die Notiz'),
  };
  if (Object.values(values).every((v) => v === null)) throw new FarmDataError(400, 'Bitte trage mindestens einen Wert oder eine Notiz ein.');
  await db.insert(growLogsTable).values({ plantId, date, ...values, waterMl: values.waterMl === null ? null : Math.round(values.waterMl) });
}

export async function deleteLog(userId: string, logId: number): Promise<void> {
  const [row] = await db
    .select({ id: growLogsTable.id })
    .from(growLogsTable)
    .innerJoin(growPlantsTable, eq(growPlantsTable.id, growLogsTable.plantId))
    .innerJoin(growsTable, eq(growsTable.id, growPlantsTable.growId))
    .where(and(eq(growLogsTable.id, logId), eq(growsTable.userId, userId)));
  if (!row) throw notFound();
  await db.delete(growLogsTable).where(eq(growLogsTable.id, logId));
}
