/**
 * Grow: weather warnings for outdoor and greenhouse grows, and the morning
 * push with the day's steps of the grow plans. Fixed rules, no AI
 * (docs/grow.md). The push is discreet by default – no grow words on the lock
 * screen – unless the account chose otherwise.
 */

import { db, growAccessTable, growPlantsTable, growPushLogTable, growsTable, usersTable } from '@workspace/db';
import { and, eq, inArray, isNotNull, isNull, lt, ne } from 'drizzle-orm';

import { addDays } from './feedSeason';
import { forecast, type DayForecast } from './farmWeather';
import { notFound } from './farmAnimals';
import { phases, plantPlan, type Flowering, type GrowEnvironment, type GrowMedium, type PhaseKey, type PlantForPlan, type SeedSex, type StrainType } from './growPlan';
import { logger } from './logger';
import { berlinDay } from './monitoring';
import { sendPushToUser } from './webPush';

export const GROW_PUSH_TIME = '07:30';

export type GrowWarningKind = 'frost' | 'heat' | 'storm' | 'rain';

export interface GrowWarning {
  kind: GrowWarningKind;
  date: string;
  text: string;
}

/** Phases in which a plant stands outside (or in the greenhouse) and can be hurt by the weather. */
const OUTSIDE: PhaseKey[] = ['seedling', 'veg', 'flower', 'flush'];
const IN_BLOOM: PhaseKey[] = ['flower', 'flush'];

/**
 * Warnings for today and tomorrow, for the phases the plants are in on each
 * day (`phaseOn` gives every plant's phase on a date). Indoors: none.
 */
export function growWeatherWarnings(days: DayForecast[], environment: GrowEnvironment, phaseOn: (date: string) => PhaseKey[]): GrowWarning[] {
  if (environment === 'indoor') return [];
  const greenhouse = environment === 'greenhouse';
  const out: GrowWarning[] = [];
  const when = (k: number) => (k === 0 ? 'heute' : 'morgen');
  const once = (kind: GrowWarningKind, date: string, text: string) => {
    if (!out.some((w) => w.kind === kind)) out.push({ kind, date, text });
  };
  days.slice(0, 2).forEach((d, k) => {
    const now = phaseOn(d.date);
    const outside = now.some((p) => OUTSIDE.includes(p));
    const bloom = now.some((p) => IN_BLOOM.includes(p));
    if (!outside) return;
    if (d.minTemp <= 2) {
      once('frost', d.date, greenhouse
        ? `Frostgefahr ${when(k)} nacht (${d.minTemp} °C): Gewächshaus früh schließen, empfindliche Pflanzen abdecken.`
        : `Frostgefahr ${when(k)} nacht (${d.minTemp} °C): Topfpflanzen reinholen, Pflanzen im Beet mit Vlies abdecken.`);
    }
    if (d.maxTemp >= (greenhouse ? 28 : 32)) {
      once('heat', d.date, greenhouse
        ? `Hitze ${when(k)} (${d.maxTemp} °C draußen): Gewächshaus früh öffnen, schattieren und morgens gießen.`
        : `Hitze ${when(k)} (${d.maxTemp} °C): morgens kräftig gießen, Töpfe vor praller Sonne schützen.`);
    }
    if (!greenhouse && d.maxGustKmh >= 60) {
      once('storm', d.date, `Sturmböen ${when(k)} (bis ${d.maxGustKmh} km/h): Pflanzen an Stäben anbinden, Töpfe windgeschützt stellen.`);
    }
    if (!greenhouse && bloom && d.precipitationMm >= 5) {
      once('rain', d.date, `Regen ${when(k)} (${d.precipitationMm} mm) in der Blüte: Schimmelgefahr – wenn möglich überdachen, Blüten danach ausschütteln und prüfen.`);
    }
  });
  return out;
}

type GrowRow = typeof growsTable.$inferSelect;
type PlantRow = typeof growPlantsTable.$inferSelect;

function planInput(p: PlantRow): PlantForPlan {
  return {
    strainType: p.strainType as StrainType,
    flowering: p.flowering as Flowering,
    seedSex: p.seedSex as SeedSex,
    flowerWeeks: p.flowerWeeks,
    startedOn: p.startedOn,
    flipOn: p.flipOn,
    harvestedOn: p.harvestedOn,
  };
}

/** Each plant's phase on a date. */
function phasesOn(plants: PlantRow[], grow: GrowRow): (date: string) => PhaseKey[] {
  const g = { environment: grow.environment as GrowEnvironment, medium: grow.medium as GrowMedium };
  const lists = plants.map((p) => phases(planInput(p), g).phases);
  return (date) => lists.map((list) => list.find((ph) => ph.from <= date && date <= ph.to)?.key ?? 'done');
}

export interface GrowWeather {
  location: { postalCode: string | null; latitude: number; longitude: number } | null;
  days: DayForecast[];
  warnings: GrowWarning[];
}

/** The forecast and warnings for one of the account's grows. */
export async function growWeather(userId: string, growId: number, today = berlinDay()): Promise<GrowWeather> {
  const [grow] = await db.select().from(growsTable).where(and(eq(growsTable.id, growId), eq(growsTable.userId, userId)));
  if (!grow) throw notFound();
  if (grow.latitude === null || grow.longitude === null || grow.environment === 'indoor') return { location: null, days: [], warnings: [] };
  const plants = await db.select().from(growPlantsTable).where(eq(growPlantsTable.growId, growId));
  const days = await forecast(grow.latitude, grow.longitude, today);
  return {
    location: { postalCode: grow.postalCode, latitude: grow.latitude, longitude: grow.longitude },
    days,
    warnings: growWeatherWarnings(days, grow.environment as GrowEnvironment, phasesOn(plants, grow)),
  };
}

// ── Morning push ──────────────────────────────────────────────────────────────

export interface DigestLine {
  plant: string;
  text: string;
}

/** The push text: full with the steps and warnings, or discreet without any grow words. */
export function growDigestMessage(steps: DigestLine[], warnings: GrowWarning[], mode: 'full' | 'discreet'): { title: string; body: string } | null {
  if (steps.length === 0 && warnings.length === 0) return null;
  if (mode === 'discreet') {
    const parts = [
      steps.length === 1 ? '1 Pflegeschritt für deine Pflanzen' : steps.length > 1 ? `${steps.length} Pflegeschritte für deine Pflanzen` : null,
      warnings.length > 0 ? 'ein Wetterhinweis' : null,
    ].filter(Boolean);
    return { title: 'Little Farming', body: `Heute: ${parts.join(' und ')}.` };
  }
  return {
    title: warnings.length > 0 ? 'Grow: Wetter und heute zu tun' : 'Grow: heute zu tun',
    body: [...warnings.map((w) => w.text), ...steps.map((s) => `${s.plant}: ${s.text}`)].join(' · '),
  };
}

/**
 * One push per account and day: the grow-plan steps that fall on today and the
 * weather warnings for outdoor grows that did not go out yesterday. Never throws.
 */
export async function sendGrowDigests(hhmm: string, day: string): Promise<number> {
  if (hhmm < GROW_PUSH_TIME) return 0;
  let sent = 0;
  try {
    const accounts = await db
      .select({ userId: growAccessTable.userId, push: growAccessTable.push })
      .from(growAccessTable)
      .innerJoin(usersTable, eq(usersTable.id, growAccessTable.userId))
      .where(
        and(
          isNotNull(growAccessTable.ageConfirmedAt),
          ne(growAccessTable.push, 'off'),
          eq(usersTable.approved, true),
        ),
      );
    if (accounts.length === 0) return 0;
    await db.delete(growPushLogTable).where(lt(growPushLogTable.day, addDays(day, -14)));
    for (const { userId, push } of accounts) {
      try {
        const [done] = await db.select({ day: growPushLogTable.day }).from(growPushLogTable).where(and(eq(growPushLogTable.userId, userId), eq(growPushLogTable.day, day)));
        if (done) continue;
        const grows = await db.select().from(growsTable).where(and(eq(growsTable.userId, userId), isNull(growsTable.archivedAt)));
        const plants = grows.length ? await db.select().from(growPlantsTable).where(inArray(growPlantsTable.growId, grows.map((g) => g.id))) : [];
        const steps: DigestLine[] = [];
        const warnings: GrowWarning[] = [];
        for (const grow of grows) {
          const mine = plants.filter((p) => p.growId === grow.id);
          if (mine.length === 0) continue;
          const g = { environment: grow.environment as GrowEnvironment, medium: grow.medium as GrowMedium };
          for (const p of mine) {
            for (const s of plantPlan(planInput(p), g, day).steps.filter((s) => s.on === day)) steps.push({ plant: p.name, text: s.text });
          }
          if (grow.environment !== 'indoor' && grow.latitude !== null && grow.longitude !== null) {
            const days = await forecast(grow.latitude, grow.longitude, day);
            for (const w of growWeatherWarnings(days, g.environment, phasesOn(mine, grow))) {
              if (!warnings.some((x) => x.kind === w.kind)) warnings.push(w);
            }
          }
        }
        const claimed = await db.insert(growPushLogTable).values({ userId, day, kinds: warnings.map((w) => w.kind) }).onConflictDoNothing().returning();
        if (claimed.length === 0) continue;
        const [yesterday] = await db.select({ kinds: growPushLogTable.kinds }).from(growPushLogTable).where(and(eq(growPushLogTable.userId, userId), eq(growPushLogTable.day, addDays(day, -1))));
        const fresh = warnings.filter((w) => !(yesterday?.kinds ?? []).includes(w.kind));
        const message = growDigestMessage(steps, fresh, push === 'full' ? 'full' : 'discreet');
        if (!message) continue;
        await sendPushToUser(userId, { topic: 'grow', ...message, tag: `grow-${day}`, url: '/grow' });
        sent += 1;
      } catch (err) {
        logger.warn({ err, userId }, 'Grow push failed');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Grow pushes failed');
  }
  return sent;
}
