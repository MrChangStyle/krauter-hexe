/**
 * Kalender & Fruchtfolge of the Beet-Architekt (step 4).
 *
 * The dates of a planting are computed from the Anbaudaten (weeks relative to
 * the last spring frost, harvest months) and the bed's frost dates – fixed
 * rules, no AI. Only what the user ticked off is stored (planting_checks).
 *
 * Once a day (from 07:30 Berlin, via the minute cron) every farm with plants
 * this season gets one push: the dates that start today and a frost warning
 * when the DWD forecast (Bright Sky) for the coming night drops to 2 °C or
 * below where frost-tender plants are already outside.
 */

import {
  bedPlantingsTable,
  db,
  farmMembershipsTable,
  gardenBedsTable,
  gardenDigestLogTable,
  plantingChecksTable,
  type GardenEventKind,
} from '@workspace/db';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';

import { FarmDataError, notFound } from './farmAnimals';
import { cropByKey, type Crop } from './gardenCatalog';
import { loadApprovedCrops } from './gardenCrops';
import { giveSeedBack, takeSeedForSowing, type SeedUse } from './seeds';
import { validSeason } from './gardenPlanner';
import { logger } from './logger';
import { sendPushToUser } from './webPush';

export interface GardenEvent {
  kind: GardenEventKind;
  /** First and last day, YYYY-MM-DD. */
  start: string;
  end: string;
}

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** The dates of one crop in a season, for a bed with this last spring frost (MM-DD). */
export function cropEvents(crop: Crop, lastFrost: string, season: number): GardenEvent[] {
  const base = `${season}-${lastFrost}`;
  const weeks = (kind: GardenEventKind, range: { from: number; to: number } | null): GardenEvent[] =>
    range ? [{ kind, start: addDays(base, range.from * 7), end: addDays(base, range.to * 7 + 6) }] : [];
  const { from, to } = crop.harvest;
  return [
    ...weeks('sow_indoor', crop.sowIndoor),
    ...weeks('direct_sow', crop.directSow),
    ...weeks('plant_out', crop.plantOut),
    {
      kind: 'harvest',
      start: `${season}-${String(from).padStart(2, '0')}-01`,
      end: lastDayOfMonth(to < from ? season + 1 : season, to),
    },
  ];
}

/**
 * Still to do? A crop can be sown indoors or directly – once one way is
 * ticked off, the other one is no longer needed.
 */
export function stillOpen(kind: GardenEventKind, done: ReadonlySet<GardenEventKind>): boolean {
  if (done.has(kind)) return false;
  if (kind === 'sow_indoor') return !done.has('direct_sow') && !done.has('plant_out');
  if (kind === 'direct_sow') return !done.has('sow_indoor') && !done.has('plant_out');
  if (kind === 'plant_out') return !done.has('direct_sow');
  return true;
}

/** Frost-tender and (probably) already outside on this day. */
export function frostTender(crop: Crop, events: GardenEvent[], done: ReadonlySet<GardenEventKind>, day: string): boolean {
  if (crop.frostHardy || done.has('harvest')) return false;
  const outside = events.filter((e) => e.kind === 'plant_out' || e.kind === 'direct_sow');
  const harvest = events.find((e) => e.kind === 'harvest');
  const isOut = done.has('plant_out') || done.has('direct_sow') || outside.some((e) => e.start <= day);
  return isOut && (!harvest || day <= harvest.end);
}

// ── Calendar of a farm ───────────────────────────────────────────────────────

export interface CalendarEntry extends GardenEvent {
  plantingId: number;
  bedId: number;
  bedName: string;
  label: string;
  cropKey: string;
  done: boolean;
  open: boolean;
}

async function seasonPlantings(farmId: number, season: number) {
  return db
    .select({
      id: bedPlantingsTable.id,
      bedId: bedPlantingsTable.bedId,
      bedName: gardenBedsTable.name,
      lastFrost: gardenBedsTable.lastFrost,
      latitude: gardenBedsTable.latitude,
      longitude: gardenBedsTable.longitude,
      cropKey: bedPlantingsTable.cropKey,
      label: bedPlantingsTable.label,
    })
    .from(bedPlantingsTable)
    .innerJoin(gardenBedsTable, and(eq(gardenBedsTable.id, bedPlantingsTable.bedId), eq(gardenBedsTable.farmId, farmId)))
    .where(and(eq(bedPlantingsTable.farmId, farmId), eq(bedPlantingsTable.season, season)))
    .orderBy(asc(gardenBedsTable.name), asc(bedPlantingsTable.y), asc(bedPlantingsTable.x));
}

async function checksOf(farmId: number, plantingIds: number[]) {
  const done = new Map<number, Set<GardenEventKind>>();
  if (plantingIds.length === 0) return done;
  const rows = await db
    .select({ plantingId: plantingChecksTable.plantingId, kind: plantingChecksTable.kind })
    .from(plantingChecksTable)
    .where(and(eq(plantingChecksTable.farmId, farmId), inArray(plantingChecksTable.plantingId, plantingIds)));
  for (const r of rows) {
    if (!done.has(r.plantingId)) done.set(r.plantingId, new Set());
    done.get(r.plantingId)!.add(r.kind);
  }
  return done;
}

type SeasonPlanting = Awaited<ReturnType<typeof seasonPlantings>>[number];

function withEvents(plantings: SeasonPlanting[], season: number) {
  return plantings.flatMap((p) => {
    const crop = p.cropKey ? cropByKey(p.cropKey) : undefined;
    return crop ? [{ planting: p, crop, events: cropEvents(crop, p.lastFrost, season) }] : [];
  });
}

/** Every date of every planting of the farm in a season, sorted by start. */
export async function farmCalendar(farmId: number, season: number): Promise<CalendarEntry[]> {
  await loadApprovedCrops();
  const plantings = withEvents(await seasonPlantings(farmId, validSeason(season)), season);
  const checks = await checksOf(farmId, plantings.map((p) => p.planting.id));
  const entries = plantings.flatMap(({ planting, crop, events }) => {
    const done = checks.get(planting.id) ?? new Set<GardenEventKind>();
    return events.map((e) => ({
      ...e,
      plantingId: planting.id,
      bedId: planting.bedId,
      bedName: planting.bedName,
      label: planting.label,
      cropKey: crop.key,
      done: done.has(e.kind),
      open: stillOpen(e.kind, done),
    }));
  });
  return entries.sort((a, b) => a.start.localeCompare(b.start) || a.bedName.localeCompare(b.bedName) || a.label.localeCompare(b.label));
}

/** Tick a date off or take the tick back; a sowing date takes seed from the stock (Saatgut) and gives it back. */
export async function setCheck(farmId: number, plantingId: number, kind: GardenEventKind, done: boolean): Promise<SeedUse | null> {
  await loadApprovedCrops();
  const [planting] = await db
    .select({ id: bedPlantingsTable.id, cropKey: bedPlantingsTable.cropKey, w: bedPlantingsTable.w, h: bedPlantingsTable.h })
    .from(bedPlantingsTable)
    .where(and(eq(bedPlantingsTable.id, plantingId), eq(bedPlantingsTable.farmId, farmId)));
  if (!planting) throw notFound();
  const crop = planting.cropKey ? cropByKey(planting.cropKey) : undefined;
  if (!crop || !cropEvents(crop, '05-15', 2000).some((e) => e.kind === kind)) {
    throw new FarmDataError(400, 'Diesen Termin gibt es für diese Pflanze nicht.');
  }
  return db.transaction(async (tx) => {
    if (done) {
      const added = await tx.insert(plantingChecksTable).values({ plantingId, farmId, kind }).onConflictDoNothing().returning();
      // Ticked twice: the seed was taken the first time.
      return added.length > 0 ? takeSeedForSowing(tx, farmId, planting, kind) : null;
    }
    await tx
      .delete(plantingChecksTable)
      .where(and(eq(plantingChecksTable.plantingId, plantingId), eq(plantingChecksTable.farmId, farmId), eq(plantingChecksTable.kind, kind)));
    await giveSeedBack(tx, farmId, plantingId, kind);
    return null;
  });
}

/** All seasons of a bed (newest first) – for crop rotation. */
export async function bedHistory(farmId: number, bedId: number) {
  const [bed] = await db
    .select({ id: gardenBedsTable.id })
    .from(gardenBedsTable)
    .where(and(eq(gardenBedsTable.id, bedId), eq(gardenBedsTable.farmId, farmId)));
  if (!bed) throw notFound();
  return db
    .select({
      id: bedPlantingsTable.id,
      season: bedPlantingsTable.season,
      cropKey: bedPlantingsTable.cropKey,
      plantId: bedPlantingsTable.plantId,
      label: bedPlantingsTable.label,
      x: bedPlantingsTable.x,
      y: bedPlantingsTable.y,
      w: bedPlantingsTable.w,
      h: bedPlantingsTable.h,
    })
    .from(bedPlantingsTable)
    .where(and(eq(bedPlantingsTable.farmId, farmId), eq(bedPlantingsTable.bedId, bedId)))
    .orderBy(desc(bedPlantingsTable.season), asc(bedPlantingsTable.y), asc(bedPlantingsTable.x));
}

// ── Frost warning ────────────────────────────────────────────────────────────

/** Air temperature (2 m) at or below which ground frost is likely. */
export const FROST_WARN_C = 2;
const USER_AGENT = 'LittleFarming/1.0 (+https://littlefarming.de)';
const FORECAST_TTL_MS = 3 * 60 * 60 * 1000;
const forecastCache = new Map<string, { min: number | null; at: number }>();

/** Lowest forecast temperature from 18:00 on this day until 09:00 the next (Berlin). */
export async function nightMinimum(lat: number, lon: number, day: string): Promise<number | null> {
  const key = `${lat},${lon},${day}`;
  const hit = forecastCache.get(key);
  if (hit && Date.now() - hit.at < FORECAST_TTL_MS) return hit.min;
  const url = `https://api.brightsky.dev/weather?lat=${lat}&lon=${lon}&date=${day}T18:00&last_date=${addDays(day, 1)}T09:00&tz=Europe/Berlin`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`Bright Sky ${res.status}`);
    const body = (await res.json()) as { weather?: { temperature: number | null }[] };
    const temps = (body.weather ?? []).map((h) => h.temperature).filter((t): t is number => typeof t === 'number');
    const min = temps.length > 0 ? Math.min(...temps) : null;
    forecastCache.set(key, { min, at: Date.now() });
    if (forecastCache.size > 5_000) forecastCache.delete(forecastCache.keys().next().value!);
    return min;
  } catch (err) {
    logger.warn({ err }, 'Frost forecast failed');
    return null;
  }
}

export interface FrostWarning {
  bedId: number;
  bedName: string;
  night: string;
  minTemp: number;
  plants: string[];
}

/** Beds of the farm where frost-tender plants meet a frosty night. */
export async function farmFrostWarnings(farmId: number, day: string): Promise<FrostWarning[]> {
  await loadApprovedCrops();
  const season = Number(day.slice(0, 4));
  const plantings = withEvents(await seasonPlantings(farmId, season), season);
  const checks = await checksOf(farmId, plantings.map((p) => p.planting.id));
  const tender = new Map<number, { bed: SeasonPlanting; labels: string[] }>();
  for (const { planting, crop, events } of plantings) {
    if (planting.latitude === null || planting.longitude === null) continue;
    if (!frostTender(crop, events, checks.get(planting.id) ?? new Set(), day)) continue;
    const entry = tender.get(planting.bedId) ?? { bed: planting, labels: [] };
    if (!entry.labels.includes(planting.label)) entry.labels.push(planting.label);
    tender.set(planting.bedId, entry);
  }
  const warnings: FrostWarning[] = [];
  for (const { bed, labels } of tender.values()) {
    const min = await nightMinimum(bed.latitude!, bed.longitude!, day);
    if (min === null || min > FROST_WARN_C) continue;
    warnings.push({ bedId: bed.bedId, bedName: bed.bedName, night: day, minTemp: Math.round(min * 10) / 10, plants: labels });
  }
  return warnings;
}

// ── Daily garden push ────────────────────────────────────────────────────────

/** From this Berlin time on, the cron sends each farm its garden push. */
export const DIGEST_TIME = '07:30';

const VERB: Record<GardenEventKind, string> = {
  sow_indoor: 'vorziehen',
  direct_sow: 'säen',
  plant_out: 'auspflanzen',
  harvest: 'ernten',
};

const temp = (t: number) => `${String(t).replace('.', ',').replace('-', '−')} °C`;

/** Title and text of the push, or null when there is nothing to say. */
export function digestMessage(starting: { label: string; kind: GardenEventKind }[], frost: FrostWarning[]): { title: string; body: string } | null {
  const parts: string[] = [];
  for (const w of frost) {
    const what = w.minTemp <= 0 ? `Frost bis ${temp(w.minTemp)}` : `Bodenfrost möglich (${temp(w.minTemp)})`;
    parts.push(`${what} heute Nacht – ${w.plants.join(', ')} im Beet „${w.bedName}“ schützen.`);
  }
  const todo = [...new Set(starting.map((e) => `${e.label} ${VERB[e.kind]}`))];
  if (todo.length > 0) {
    const shown = todo.slice(0, 4).join(', ');
    parts.push(`Ab heute: ${shown}${todo.length > 4 ? ` und ${todo.length - 4} mehr` : ''}.`);
  }
  if (parts.length === 0) return null;
  return { title: frost.length > 0 ? 'Frostwarnung für deinen Garten' : 'Heute im Garten', body: parts.join(' ') };
}

/**
 * Sends the daily garden push to the admins and caretakers of every farm
 * that has plants this season (once per farm and day). Never throws.
 */
export async function sendGardenDigests(hhmm: string, day: string): Promise<number> {
  if (hhmm < DIGEST_TIME) return 0;
  const season = Number(day.slice(0, 4));
  let sent = 0;
  try {
    const farms = await db
      .selectDistinct({ farmId: bedPlantingsTable.farmId })
      .from(bedPlantingsTable)
      .where(
        and(
          eq(bedPlantingsTable.season, season),
          sql`NOT EXISTS (SELECT 1 FROM ${gardenDigestLogTable} WHERE ${gardenDigestLogTable.farmId} = ${bedPlantingsTable.farmId} AND ${gardenDigestLogTable.day} = ${day})`,
        ),
      );
    if (farms.length === 0) return 0;
    await db.delete(gardenDigestLogTable).where(lt(gardenDigestLogTable.day, addDays(day, -14)));
    for (const { farmId } of farms) {
      // Claim the day first, so parallel cron calls cannot send twice.
      const claimed = await db.insert(gardenDigestLogTable).values({ farmId, day }).onConflictDoNothing().returning();
      if (claimed.length === 0) continue;
      try {
        const starting = (await farmCalendar(farmId, season)).filter((e) => e.open && e.start === day);
        const message = digestMessage(starting, await farmFrostWarnings(farmId, day));
        if (!message) continue;
        const members = await db
          .select({ userId: farmMembershipsTable.userId })
          .from(farmMembershipsTable)
          .where(and(eq(farmMembershipsTable.farmId, farmId), inArray(farmMembershipsTable.role, ['admin', 'caretaker'])));
        for (const { userId } of members) {
          await sendPushToUser(userId, { ...message, tag: `garden-${farmId}-${day}`, url: '/aufgaben' });
        }
        sent += 1;
      } catch (err) {
        logger.warn({ err, farmId }, 'Garden push failed');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Garden pushes failed');
  }
  return sent;
}
