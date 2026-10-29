/**
 * Wetter für den Hof: where the farm is, the forecast of the German Weather
 * Service (DWD open data via Bright Sky) for three days, and fixed warnings
 * for the animals on the farm (frost, hard frost, heat, storm, heavy rain)
 * plus a watering hint for the garden. One morning push per farm; a warning
 * that lasts several days is pushed once. On top, the official warnings of
 * the DWD for the farm's area (Bright Sky /alerts); severe ones are pushed as
 * soon as they appear. No AI.
 *
 * Only the rounded position (0.1°, about 10 km) leaves the server.
 */

import {
  bedPlantingsTable,
  db,
  farmAnimalsTable,
  farmMembershipsTable,
  farmsTable,
  gardenBedsTable,
  herdsTable,
  weatherAlertLogTable,
  weatherDigestLogTable,
  FARM_SPECIES,
  type FarmSpecies,
} from '@workspace/db';
import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';

import { FarmDataError, notFound } from './farmAnimals';
import { addDays } from './feedSeason';
import { geocodePostalCode, roundCoord } from './gardenClimate';
import { logger } from './logger';
import { berlinDay } from './monitoring';
import { sendPushToUser } from './webPush';

const USER_AGENT = 'LittleFarming/1.0 (+https://littlefarming.de)';
const TIMEOUT_MS = 8_000;
const CACHE_MS = 60 * 60 * 1000;
export const FORECAST_DAYS = 7;
export const WEATHER_DIGEST_TIME = '07:30';

// ── Location ─────────────────────────────────────────────────────────────────

export interface FarmLocation {
  /** "farm": set for the farm; "bed": taken from a garden bed. */
  source: 'farm' | 'bed';
  postalCode: string | null;
  latitude: number;
  longitude: number;
}

export async function farmLocation(farmId: number): Promise<FarmLocation | null> {
  const [farm] = await db
    .select({ postalCode: farmsTable.postalCode, latitude: farmsTable.latitude, longitude: farmsTable.longitude })
    .from(farmsTable)
    .where(eq(farmsTable.id, farmId));
  if (!farm) throw notFound();
  if (farm.latitude !== null && farm.longitude !== null) return { source: 'farm', postalCode: farm.postalCode, latitude: farm.latitude, longitude: farm.longitude };
  const [bed] = await db
    .select({ postalCode: gardenBedsTable.postalCode, latitude: gardenBedsTable.latitude, longitude: gardenBedsTable.longitude })
    .from(gardenBedsTable)
    .where(and(eq(gardenBedsTable.farmId, farmId), isNotNull(gardenBedsTable.latitude), isNotNull(gardenBedsTable.longitude)))
    .orderBy(asc(gardenBedsTable.id))
    .limit(1);
  return bed ? { source: 'bed', postalCode: bed.postalCode, latitude: bed.latitude!, longitude: bed.longitude! } : null;
}

export interface LocationInput {
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** The phone's position wins; else the postal code; neither clears the location. */
export async function setFarmLocation(farmId: number, input: LocationInput): Promise<FarmLocation | null> {
  const postalCode = input.postalCode?.trim() || null;
  if (postalCode && !/^\d{5}$/.test(postalCode)) throw new FarmDataError(400, 'Die Postleitzahl hat fünf Ziffern.');
  let latitude: number | null = null;
  let longitude: number | null = null;
  const lat = input.latitude ?? null;
  const lon = input.longitude ?? null;
  if (lat !== null && lon !== null) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new FarmDataError(400, 'Der Standort ist ungültig.');
    latitude = roundCoord(lat);
    longitude = roundCoord(lon);
  } else if (postalCode) {
    const found = await geocodePostalCode(postalCode);
    if (!found) throw new FarmDataError(422, 'Zu dieser Postleitzahl wurde kein Ort gefunden.');
    latitude = found.latitude;
    longitude = found.longitude;
  }
  await db.update(farmsTable).set({ postalCode, latitude, longitude }).where(eq(farmsTable.id, farmId));
  return farmLocation(farmId);
}

// ── Forecast ─────────────────────────────────────────────────────────────────

export type WeatherIcon = 'sun' | 'cloud' | 'rain' | 'snow' | 'storm';

export interface DayForecast {
  date: string;
  minTemp: number;
  maxTemp: number;
  precipitationMm: number;
  maxGustKmh: number;
  icon: WeatherIcon;
}

interface HourRecord {
  timestamp: string;
  temperature: number | null;
  precipitation: number | null;
  wind_gust_speed: number | null;
  icon: string | null;
}

function iconOf(hours: HourRecord[]): WeatherIcon {
  // Daytime only; the worst weather of the day wins over the most frequent.
  const day = hours.filter((h) => {
    const hour = Number(h.timestamp.slice(11, 13));
    return hour >= 8 && hour <= 20;
  });
  const icons = (day.length ? day : hours).map((h) => h.icon ?? '');
  if (icons.includes('thunderstorm')) return 'storm';
  if (icons.some((i) => i === 'snow' || i === 'sleet')) return 'snow';
  if (icons.filter((i) => i === 'rain' || i === 'hail').length >= 2) return 'rain';
  const sunny = icons.filter((i) => i.startsWith('clear') || i === 'partly-cloudy-day').length;
  return sunny >= icons.length / 2 ? 'sun' : 'cloud';
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Hourly records → one line per Berlin day (from Bright Sky's local timestamps). */
export function daysFromHours(records: HourRecord[], firstDay: string, count = FORECAST_DAYS): DayForecast[] {
  const out: DayForecast[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(firstDay, i);
    const hours = records.filter((r) => r.timestamp.slice(0, 10) === date);
    const temps = hours.map((h) => h.temperature).filter((t): t is number => t !== null);
    if (temps.length < 12) continue;
    out.push({
      date,
      minTemp: r1(Math.min(...temps)),
      maxTemp: r1(Math.max(...temps)),
      precipitationMm: r1(hours.reduce((s, h) => s + (h.precipitation ?? 0), 0)),
      maxGustKmh: Math.round(Math.max(0, ...hours.map((h) => h.wind_gust_speed ?? 0))),
      icon: iconOf(hours),
    });
  }
  return out;
}

const cache = new Map<string, { days: DayForecast[]; at: number }>();

/** A week from today; empty when the weather service does not answer. */
export async function forecast(latitude: number, longitude: number, today: string): Promise<DayForecast[]> {
  const key = `${roundCoord(latitude)},${roundCoord(longitude)},${today}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.days;
  try {
    const url = `https://api.brightsky.dev/weather?lat=${roundCoord(latitude)}&lon=${roundCoord(longitude)}&date=${today}&last_date=${addDays(today, FORECAST_DAYS)}&tz=Europe/Berlin`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Bright Sky ${res.status}`);
    const body = (await res.json()) as { weather?: HourRecord[] };
    const days = daysFromHours(body.weather ?? [], today);
    cache.set(key, { days, at: Date.now() });
    if (cache.size > 2_000) cache.delete(cache.keys().next().value!);
    return days;
  } catch (err) {
    logger.warn({ err }, 'Weather forecast failed');
    return [];
  }
}

// ── Warnings ─────────────────────────────────────────────────────────────────

export type WarningKind = 'hardFrost' | 'frost' | 'frostSpell' | 'heat' | 'heatSpell' | 'storm' | 'rain' | 'dry';

export interface WeatherWarning {
  kind: WarningKind;
  date: string;
  text: string;
}

const WEEKDAY = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dayText = (day: string) => `${WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()]} ${day.slice(8, 10)}.${day.slice(5, 7)}.`;

/** At least this many days in a row make a frost or heat spell. */
export const SPELL_DAYS = 3;

/** The run of days matching `test` that starts today or tomorrow, if it is a spell. */
function spell(days: DayForecast[], test: (d: DayForecast) => boolean): DayForecast[] | null {
  const start = days.slice(0, 2).findIndex(test);
  if (start < 0) return null;
  let end = start;
  while (end + 1 < days.length && test(days[end + 1]!)) end += 1;
  return end - start + 1 >= SPELL_DAYS ? days.slice(start, end + 1) : null;
}

const temp = (t: number) => `${t < 0 ? '−' : ''}${Math.abs(t).toLocaleString('de-DE')} °C`;
const SMALL_PETS: FarmSpecies[] = ['rabbit', 'guineaPig'];
const GRAZERS: FarmSpecies[] = ['goat', 'sheep', 'horse', 'cattle', 'alpaca', 'goose', 'rhea', 'donkey'];
const WATERFOWL: FarmSpecies[] = ['goose', 'duck'];
/** Frost notes for poultry besides chickens (docs/gefluegel.md). */
function poultryFrost(has: (list: FarmSpecies[]) => boolean): string {
  return (
    (has(WATERFOWL) ? ' Enten und Gänse: Badewasser täglich eisfrei – sie baden auch im Winter.' : '') +
    (has(['quail']) ? ' Wachteln zugfrei und trocken unterbringen, sie vertragen Kälte schlechter als Hühner.' : '')
  );
}
/** Alpakas suffer from heat early, above all in full fleece before shearing. */
const ALPACA_HEAT = ' Alpakas leiden früh unter Hitze, besonders vor der Schur: Schatten, Wasser, Bauch und Beine mit dem Schlauch abkühlen – nicht den Rücken.';

/**
 * Warnings for today and tomorrow – fixed rules. `species`: animals on the
 * farm (none → no animal warnings); `garden`: plants in the beds this season.
 */
export function weatherWarnings(days: DayForecast[], species: FarmSpecies[], garden: boolean): WeatherWarning[] {
  const next = days.slice(0, 2);
  const when = (d: DayForecast) => (d === days[0] ? 'heute' : 'morgen');
  const has = (list: FarmSpecies[]) => species.some((s) => list.includes(s));
  const out: WeatherWarning[] = [];
  const first = (test: (d: DayForecast) => boolean) => next.find(test);
  const worst = (pick: (d: DayForecast) => number, dir: 1 | -1) => next.reduce((a, b) => (pick(b) * dir > pick(a) * dir ? b : a));

  if (species.length > 0 && next.length > 0) {
    const cold = worst((d) => d.minTemp, -1);
    // Several days of frost in the week ahead: one warning for the whole spell.
    const frostRun = spell(days, (d) => d.minTemp <= 0);
    if (frostRun) {
      const low = Math.min(...frostRun.map((d) => d.minTemp));
      out.push({
        kind: 'frostSpell',
        date: frostRun[0]!.date,
        text:
          `Frostperiode: ${frostRun.length} Tage in Folge Frost bis ${temp(low)} (bis ${dayText(frostRun.at(-1)!.date)}${frostRun.length === days.length ? ' und länger' : ''}): ` +
          'Tränken mehrmals am Tag frostfrei, Vorrat an Heu, Einstreu und Futter für die ganze Zeit prüfen, Wasserleitungen schützen.' +
          (species.includes('guineaPig') ? ' Meerschweinchen frostfrei unterbringen.' : '') +
          poultryFrost(has),
      });
    }
    if (cold.minTemp <= -10) {
      out.push({
        kind: 'hardFrost',
        date: cold.date,
        text:
          `Strenger Frost bis ${temp(cold.minTemp)} (${when(cold)}): Ställe zugfrei schließen, Tränken mehrmals am Tag wechseln, mehr Raufutter.` +
          (has(SMALL_PETS) ? ' Außenställe von Kaninchen isolieren, Meerschweinchen ins Haus.' : '') +
          poultryFrost(has),
      });
    } else if (cold.minTemp <= 0 && !frostRun) {
      out.push({
        kind: 'frost',
        date: cold.date,
        text:
          `Frost bis ${temp(cold.minTemp)} (${when(cold)}): Tränken frostfrei halten – mehrmals am Tag frisches Wasser, Einstreu dicker.` +
          (species.includes('guineaPig') ? ' Meerschweinchen frostfrei unterbringen.' : '') +
          poultryFrost(has),
      });
    }
    const hot = worst((d) => d.maxTemp, 1);
    const heatLimit = has(SMALL_PETS) ? 28 : 30;
    const heatRun = spell(days, (d) => d.maxTemp >= heatLimit);
    if (heatRun) {
      const high = Math.max(...heatRun.map((d) => d.maxTemp));
      out.push({
        kind: 'heatSpell',
        date: heatRun[0]!.date,
        text:
          `Hitzewelle: ${heatRun.length} Tage in Folge bis ${temp(high)} (bis ${dayText(heatRun.at(-1)!.date)}${heatRun.length === days.length ? ' und länger' : ''}): ` +
          'Ställe nachts lüften, Wasser mehrmals am Tag frisch und kühl, Schatten auf Weide und Auslauf, Arbeit in die Morgenstunden; auf Fliegen und Madenbefall achten.' +
          (has(SMALL_PETS) ? ' Kaninchen und Meerschweinchen sind ab 28 °C hitzschlaggefährdet – kühle Fliesen, nie in die pralle Sonne.' : '') +
          (species.includes('alpaca') ? ALPACA_HEAT : ''),
      });
    } else if (hot.maxTemp >= heatLimit) {
      out.push({
        kind: 'heat',
        date: hot.date,
        text:
          `Hitze bis ${temp(hot.maxTemp)} (${when(hot)}): Schatten und frisches Wasser mehrmals am Tag, Arbeit mit den Tieren in die kühlen Morgenstunden.` +
          (has(SMALL_PETS) ? ' Kaninchen und Meerschweinchen sind ab 28 °C hitzschlaggefährdet – kühle Fliesen, nie in die pralle Sonne.' : '') +
          (has(GRAZERS) ? ' Weidetiere brauchen Schatten auf der Weide.' : '') +
          (species.includes('alpaca') ? ALPACA_HEAT : ''),
      });
    }
    const storm = first((d) => d.maxGustKmh >= 75);
    if (storm) {
      out.push({ kind: 'storm', date: storm.date, text: `Sturmböen bis ${storm.maxGustKmh} km/h (${when(storm)}): Netze, Planen und Ausläufe sichern, Tiere in den Stall.` });
    }
    const rain = first((d) => d.precipitationMm >= 20);
    if (rain) {
      out.push({
        kind: 'rain',
        date: rain.date,
        text:
          `Starkregen, ${rain.precipitationMm.toLocaleString('de-DE')} l/m² (${when(rain)}): trockene Unterstände und Liegeplätze, Ausläufe auf Staunässe prüfen.` +
          (species.includes('donkey') ? ' Esel haben kein wasserdichtes Fell – sie brauchen jetzt einen trockenen Unterstand.' : ''),
      });
    }
  }
  if (garden && next.length === 2) {
    const dry = next.reduce((s, d) => s + d.precipitationMm, 0) < 1;
    const hot = worst((d) => d.maxTemp, 1);
    if (dry && hot.maxTemp >= 28) {
      out.push({ kind: 'dry', date: hot.date, text: `Heiß und trocken (bis ${temp(hot.maxTemp)}): Beete morgens oder abends durchdringend gießen, Mulch hält die Feuchte.` });
    }
  }
  return out;
}

// ── Official DWD warnings ────────────────────────────────────────────────────

export type AlertSeverity = 'minor' | 'moderate' | 'severe' | 'extreme';
export const ALERT_LEVEL: Record<AlertSeverity, number> = { minor: 1, moderate: 2, severe: 3, extreme: 4 };
const ALERT_CACHE_MS = 10 * 60 * 1000;

export interface OfficialAlert {
  id: string;
  event: string;
  headline: string;
  description: string;
  instruction: string | null;
  severity: AlertSeverity;
  onset: string;
  expires: string | null;
}

export interface OfficialAlerts {
  /** The DWD warning area (municipality) the position falls in. */
  area: string | null;
  alerts: OfficialAlert[];
}

interface AlertRecord {
  alert_id: string;
  status: string;
  onset: string;
  expires: string | null;
  category: string | null;
  response_type: string | null;
  severity: string | null;
  event_code: number | null;
  event_de: string | null;
  headline_de: string;
  description_de: string;
  instruction_de: string | null;
}

/**
 * Bright Sky's answer → the warnings that count: real (not test), weather or
 * health (heat), not an all-clear, not yet over; the worst first.
 */
export function pickAlerts(records: AlertRecord[], now: Date): OfficialAlert[] {
  return records
    .filter(
      (a) =>
        a.status === 'actual' &&
        (a.category === 'met' || a.category === 'health') &&
        a.response_type !== 'allclear' &&
        a.severity !== null &&
        a.severity in ALERT_LEVEL &&
        (a.expires === null || Date.parse(a.expires) > now.getTime()),
    )
    .map((a) => ({
      id: a.alert_id,
      event: a.event_de ?? a.headline_de,
      headline: a.headline_de,
      description: a.description_de,
      instruction: a.instruction_de || null,
      severity: a.severity as AlertSeverity,
      onset: a.onset,
      expires: a.expires,
      code: a.event_code,
    }))
    .sort((a, b) => ALERT_LEVEL[b.severity] - ALERT_LEVEL[a.severity] || a.onset.localeCompare(b.onset))
    .map(({ code: _code, ...alert }) => alert);
}

const alertCache = new Map<string, { result: OfficialAlerts; keys: Map<string, string>; at: number }>();

/** The DWD warnings for the rounded position; none when the service does not answer. */
async function fetchAlerts(latitude: number, longitude: number, now: Date): Promise<{ result: OfficialAlerts; keys: Map<string, string> }> {
  const key = `${roundCoord(latitude)},${roundCoord(longitude)}`;
  const hit = alertCache.get(key);
  if (hit && now.getTime() - hit.at < ALERT_CACHE_MS) return hit;
  try {
    const url = `https://api.brightsky.dev/alerts?lat=${roundCoord(latitude)}&lon=${roundCoord(longitude)}&tz=Europe/Berlin`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Bright Sky alerts ${res.status}`);
    const body = (await res.json()) as { alerts?: AlertRecord[]; location?: { name?: string } | null };
    const records = body.alerts ?? [];
    const alerts = pickAlerts(records, now);
    // Event and first day: the same warning under a new id is the same warning.
    const keys = new Map(records.map((r) => [r.alert_id, `${r.event_code ?? r.event_de ?? r.alert_id}|${r.onset.slice(0, 10)}`]));
    const entry = { result: { area: body.location?.name ?? null, alerts }, keys, at: now.getTime() };
    alertCache.set(key, entry);
    if (alertCache.size > 2_000) alertCache.delete(alertCache.keys().next().value!);
    return entry;
  } catch (err) {
    logger.warn({ err }, 'Weather alerts failed');
    return { result: { area: null, alerts: [] }, keys: new Map() };
  }
}

export async function officialAlerts(latitude: number, longitude: number, now = new Date()): Promise<OfficialAlerts> {
  return (await fetchAlerts(latitude, longitude, now)).result;
}

// ── For the app ──────────────────────────────────────────────────────────────

async function farmSpecies(farmId: number): Promise<FarmSpecies[]> {
  const animals = await db
    .selectDistinct({ species: farmAnimalsTable.species })
    .from(farmAnimalsTable)
    .where(and(eq(farmAnimalsTable.farmId, farmId), isNull(farmAnimalsTable.archivedAt)));
  const herds = await db.selectDistinct({ species: herdsTable.species }).from(herdsTable).where(eq(herdsTable.farmId, farmId));
  const present = new Set([...animals, ...herds].map((a) => a.species));
  return FARM_SPECIES.filter((s) => present.has(s));
}

async function hasGarden(farmId: number, season: number): Promise<boolean> {
  const [row] = await db
    .select({ id: bedPlantingsTable.id })
    .from(bedPlantingsTable)
    .where(and(eq(bedPlantingsTable.farmId, farmId), eq(bedPlantingsTable.season, season)))
    .limit(1);
  return !!row;
}

export interface FarmWeather {
  location: FarmLocation | null;
  days: DayForecast[];
  warnings: WeatherWarning[];
  alerts: OfficialAlert[];
  alertArea: string | null;
}

export async function farmWeather(farmId: number): Promise<FarmWeather> {
  const location = await farmLocation(farmId);
  if (!location) return { location: null, days: [], warnings: [], alerts: [], alertArea: null };
  const today = berlinDay();
  const [days, official] = await Promise.all([forecast(location.latitude, location.longitude, today), officialAlerts(location.latitude, location.longitude)]);
  const warnings = weatherWarnings(days, await farmSpecies(farmId), await hasGarden(farmId, Number(today.slice(0, 4))));
  return { location, days, warnings, alerts: official.alerts, alertArea: official.area };
}

// ── Morning push ─────────────────────────────────────────────────────────────

/**
 * One push per farm and day to admins and caretakers: the warnings for today
 * and tomorrow whose kind did not go out yesterday. Never throws.
 */
export async function sendWeatherDigests(hhmm: string, day: string): Promise<number> {
  if (hhmm < WEATHER_DIGEST_TIME) return 0;
  let sent = 0;
  try {
    const done = await db.select({ farmId: weatherDigestLogTable.farmId }).from(weatherDigestLogTable).where(eq(weatherDigestLogTable.day, day));
    const skip = new Set(done.map((d) => d.farmId));
    const farms = (await db.select({ id: farmsTable.id }).from(farmsTable)).filter((f) => !skip.has(f.id));
    if (farms.length === 0) return 0;
    await db.delete(weatherDigestLogTable).where(lt(weatherDigestLogTable.day, addDays(day, -14)));
    for (const { id: farmId } of farms) {
      try {
        const species = await farmSpecies(farmId);
        const garden = await hasGarden(farmId, Number(day.slice(0, 4)));
        const location = species.length > 0 || garden ? await farmLocation(farmId) : null;
        if (!location) {
          // Nothing to warn about today – done for the day.
          await db.insert(weatherDigestLogTable).values({ farmId, day, kinds: [] }).onConflictDoNothing();
          continue;
        }
        const days = await forecast(location.latitude, location.longitude, day);
        if (days.length === 0) continue; // try again on the next cron call
        const warnings = weatherWarnings(days, species, garden);
        // Claim the day first (with what is known now), so parallel calls cannot send twice.
        const claimed = await db
          .insert(weatherDigestLogTable)
          .values({ farmId, day, kinds: warnings.map((w) => w.kind) })
          .onConflictDoNothing()
          .returning();
        if (claimed.length === 0) continue;
        const [yesterday] = await db
          .select({ kinds: weatherDigestLogTable.kinds })
          .from(weatherDigestLogTable)
          .where(and(eq(weatherDigestLogTable.farmId, farmId), eq(weatherDigestLogTable.day, addDays(day, -1))));
        const fresh = warnings.filter((w) => !(yesterday?.kinds ?? []).includes(w.kind));
        if (fresh.length === 0) continue;
        const members = await db
          .select({ userId: farmMembershipsTable.userId })
          .from(farmMembershipsTable)
          .where(and(eq(farmMembershipsTable.farmId, farmId), inArray(farmMembershipsTable.role, ['admin', 'caretaker'])));
        const title = fresh.some((w) => w.kind === 'hardFrost' || w.kind === 'storm') ? 'Unwetter-Warnung für deinen Hof' : 'Wetter-Hinweis für deinen Hof';
        for (const { userId } of members) {
          await sendPushToUser(userId, { topic: 'weather', title, body: fresh.map((w) => w.text).join(' '), tag: `weather-${farmId}-${day}`, url: '/app' });
        }
        sent += 1;
      } catch (err) {
        logger.warn({ err, farmId }, 'Weather push failed');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Weather pushes failed');
  }
  return sent;
}

// ── Push for official warnings ───────────────────────────────────────────────

/** From „Unwetter“ (DWD level 3) on, a warning is pushed when it appears. */
export const ALERT_PUSH_LEVEL = ALERT_LEVEL.severe;

/**
 * On every cron call: severe and extreme DWD warnings for farms with animals
 * or a garden, to admins and caretakers – once per warning and farm, again
 * only when it gets worse (weather_alert_log). Quiet times apply as for every
 * push. Never throws.
 */
export async function sendAlertPushes(day: string, now = new Date()): Promise<number> {
  let sent = 0;
  try {
    // On the database clock, like sent_at.
    await db.delete(weatherAlertLogTable).where(lt(weatherAlertLogTable.sentAt, sql`now() - interval '14 days'`));
    const farms = await db.select({ id: farmsTable.id }).from(farmsTable);
    for (const { id: farmId } of farms) {
      try {
        const location = await farmLocation(farmId);
        if (!location) continue;
        if ((await farmSpecies(farmId)).length === 0 && !(await hasGarden(farmId, Number(day.slice(0, 4))))) continue;
        const { result, keys } = await fetchAlerts(location.latitude, location.longitude, now);
        for (const alert of result.alerts) {
          const level = ALERT_LEVEL[alert.severity];
          if (level < ALERT_PUSH_LEVEL) continue;
          // Claim it first – new, or worse than what was pushed – so parallel calls cannot send twice.
          const claimed = await db
            .insert(weatherAlertLogTable)
            .values({ farmId, key: keys.get(alert.id) ?? alert.id, level })
            .onConflictDoUpdate({
              target: [weatherAlertLogTable.farmId, weatherAlertLogTable.key],
              set: { level, sentAt: sql`now()` },
              setWhere: lt(weatherAlertLogTable.level, level),
            })
            .returning();
          if (claimed.length === 0) continue;
          const members = await db
            .select({ userId: farmMembershipsTable.userId })
            .from(farmMembershipsTable)
            .where(and(eq(farmMembershipsTable.farmId, farmId), inArray(farmMembershipsTable.role, ['admin', 'caretaker'])));
          const title = level === ALERT_LEVEL.extreme ? 'Extreme Unwetterwarnung (DWD)' : 'Unwetterwarnung des DWD';
          const body = [alert.headline, alert.instruction].filter(Boolean).join(' – ').slice(0, 300);
          for (const { userId } of members) {
            await sendPushToUser(userId, { topic: 'weather', title, body, tag: `dwd-${farmId}-${alert.id}`, url: '/app' });
          }
          sent += 1;
        }
      } catch (err) {
        logger.warn({ err, farmId }, 'Weather alert push failed');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Weather alert pushes failed');
  }
  return sent;
}
