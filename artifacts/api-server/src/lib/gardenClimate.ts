/**
 * Where a bed is and when it freezes there (Beet-Architekt).
 *
 * - Postal code → coordinates via OpenStreetMap Nominatim (free, attribution
 *   "© OpenStreetMap", at most one request per bed save). The app can also
 *   send the phone's GPS position instead.
 * - Typical last spring frost and first autumn frost from the weather history
 *   of the German Weather Service (DWD, open data) via Bright Sky: the median
 *   over the last years, computed once per 0.1° cell and cached in
 *   frost_climate. Only the rounded coordinates leave the server.
 *
 * Everything here is best effort: without an answer the bed keeps the
 * default dates (15.05. / 15.10.), which the user can always correct.
 */

import { db, frostClimateTable, gardenBedsTable } from '@workspace/db';
import { and, eq, ne } from 'drizzle-orm';

import { logger } from './logger';

const USER_AGENT = 'LittleFarming/1.0 (+https://littlefarming.de)';
const TIMEOUT_MS = 8_000;
export const FROST_YEARS = 10;
const MIN_YEARS = 5;

/** 0.1° ≈ 10 km – precise enough for weather, no exact address. */
export function roundCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

export async function geocodePostalCode(postalCode: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(postalCode)}&country=de&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'de' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const [hit] = (await res.json()) as { lat?: string; lon?: string }[];
    const latitude = Number(hit?.lat);
    const longitude = Number(hit?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude: roundCoord(latitude), longitude: roundCoord(longitude) };
  } catch {
    return null;
  }
}

// ── Frost dates from weather history ─────────────────────────────────────────

/** "2024-04-21" → day of year (non-leap calendar, so years compare). */
function dayOfYear(mmdd: string): number {
  const [mo, d] = mmdd.split('-').map(Number) as [number, number];
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days.slice(0, mo - 1).reduce((a, b) => a + b, 0) + Math.min(d, days[mo - 1]!);
}

function fromDayOfYear(doy: number): string {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let mo = 0;
  while (doy > days[mo]!) {
    doy -= days[mo]!;
    mo += 1;
  }
  return `${String(mo + 1).padStart(2, '0')}-${String(doy).padStart(2, '0')}`;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/**
 * Daily minimum temperatures (Berlin day → °C) of one year's spring and
 * autumn → that year's last spring frost and first autumn frost (≤ 0 °C).
 */
export function frostDaysOfYear(spring: Map<string, number>, autumn: Map<string, number>): { last: string | null; first: string | null } {
  const frosty = (m: Map<string, number>) => [...m.entries()].filter(([, t]) => t <= 0).map(([d]) => d.slice(5)).sort();
  const springFrost = frosty(spring);
  const autumnFrost = frosty(autumn);
  return { last: springFrost.at(-1) ?? null, first: autumnFrost[0] ?? null };
}

/** Median over the years; null with too few years of data. */
export function typicalFrostDates(years: { last: string | null; first: string | null }[]): { lastFrost: string; firstFrost: string; years: number } | null {
  const lasts = years.map((y) => y.last).filter((v): v is string => !!v).map(dayOfYear);
  const firsts = years.map((y) => y.first).filter((v): v is string => !!v).map(dayOfYear);
  const n = Math.min(lasts.length, firsts.length);
  if (n < MIN_YEARS) return null;
  return { lastFrost: fromDayOfYear(median(lasts)), firstFrost: fromDayOfYear(median(firsts)), years: n };
}

/** Hourly DWD data for a period → daily minimum per Berlin day. */
async function dailyMinimums(lat: number, lon: number, from: string, to: string): Promise<Map<string, number>> {
  const url = `https://api.brightsky.dev/weather?lat=${lat}&lon=${lon}&date=${from}&last_date=${to}&tz=Europe/Berlin`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS * 2) });
  if (!res.ok) throw new Error(`Bright Sky ${res.status}`);
  const body = (await res.json()) as { weather?: { timestamp: string; temperature: number | null }[] };
  const mins = new Map<string, number>();
  for (const h of body.weather ?? []) {
    if (typeof h.temperature !== 'number') continue;
    const day = h.timestamp.slice(0, 10);
    const prev = mins.get(day);
    if (prev === undefined || h.temperature < prev) mins.set(day, h.temperature);
  }
  return mins;
}

async function frostDatesFromHistory(lat: number, lon: number) {
  const thisYear = new Date().getUTCFullYear();
  const perYear: { last: string | null; first: string | null }[] = [];
  for (let y = thisYear - FROST_YEARS; y < thisYear; y += 1) {
    try {
      const spring = await dailyMinimums(lat, lon, `${y}-02-15`, `${y}-06-30`);
      const autumn = await dailyMinimums(lat, lon, `${y}-08-15`, `${y}-12-31`);
      if (spring.size > 60 && autumn.size > 60) perYear.push(frostDaysOfYear(spring, autumn));
    } catch (err) {
      logger.warn({ err, year: y }, 'Frost history: year skipped');
    }
  }
  return typicalFrostDates(perYear);
}

/** Cached per 0.1° cell; computed (and stored) on the first request. */
export async function frostDatesFor(lat: number, lon: number) {
  const latKey = Math.round(lat * 10);
  const lonKey = Math.round(lon * 10);
  const [cached] = await db
    .select()
    .from(frostClimateTable)
    .where(and(eq(frostClimateTable.latKey, latKey), eq(frostClimateTable.lonKey, lonKey)));
  if (cached) return { lastFrost: cached.lastFrost, firstFrost: cached.firstFrost, years: cached.years };
  const computed = await frostDatesFromHistory(latKey / 10, lonKey / 10);
  if (!computed) return null;
  await db.insert(frostClimateTable).values({ latKey, lonKey, ...computed }).onConflictDoNothing();
  return computed;
}

/**
 * Fills in a bed's frost dates from the weather history – unless the user
 * set them by hand. Runs after the bed was saved; never throws.
 */
export async function refreshBedFrostDates(bedId: number, lat: number, lon: number): Promise<void> {
  try {
    const dates = await frostDatesFor(lat, lon);
    if (!dates) return;
    await db
      .update(gardenBedsTable)
      .set({ lastFrost: dates.lastFrost, firstFrost: dates.firstFrost, frostSource: 'climate' })
      .where(
        and(
          eq(gardenBedsTable.id, bedId),
          ne(gardenBedsTable.frostSource, 'manual'),
          eq(gardenBedsTable.latitude, lat),
          eq(gardenBedsTable.longitude, lon),
        ),
      );
  } catch (err) {
    logger.warn({ err, bedId }, 'Frost dates for bed failed');
  }
}
