/**
 * Bewirtschaftung (docs/bio.md): how a farm works – conventional, natural
 * (naturnah, no certificate), organic by the EU regulation or by an organic
 * association. Natural and up switch the plant advice to organic means only;
 * the later steps (docs/BIO-KONZEPT.md) build their checks on this level.
 */

import { db, farmMembershipsTable, farmsTable, userSettingsTable } from '@workspace/db';
import { and, eq, ne } from 'drizzle-orm';
import { FarmDataError, notFound, text } from './farmAnimals';
import { addDays } from './feedSeason';
import { berlinDay } from './monitoring';

export const FARMING_LEVELS = ['conventional', 'natural', 'organic', 'association'] as const;
export type FarmingLevel = (typeof FARMING_LEVELS)[number];

export interface Farming {
  level: FarmingLevel;
  /** Öko-Kontrollstelle, e.g. "DE-ÖKO-006" – organic and association only. */
  controlBody: string | null;
  /** Start of the conversion (Umstellung), YYYY-MM-DD – organic and association only. */
  organicSince: string | null;
}

export function isFarmingLevel(v: unknown): v is FarmingLevel {
  return typeof v === 'string' && (FARMING_LEVELS as readonly string[]).includes(v);
}

/** Natural and up: plant advice names organic means only. */
export function organicAdvice(level: FarmingLevel): boolean {
  return level !== 'conventional';
}

/** Certified (or converting): organic by the EU regulation or an association. */
export function certified(level: FarmingLevel): boolean {
  return level === 'organic' || level === 'association';
}

export async function getFarming(farmId: number): Promise<Farming> {
  const [row] = await db
    .select({ level: farmsTable.farming, controlBody: farmsTable.organicControlBody, organicSince: farmsTable.organicSince })
    .from(farmsTable)
    .where(eq(farmsTable.id, farmId));
  if (!row) throw notFound();
  const level = isFarmingLevel(row.level) ? row.level : 'conventional';
  return certified(level)
    ? { level, controlBody: row.controlBody, organicSince: row.organicSince }
    : { level, controlBody: null, organicSince: null };
}

export async function setFarming(
  farmId: number,
  input: { level?: unknown; controlBody?: unknown; organicSince?: unknown },
  today = berlinDay(),
): Promise<Farming> {
  const set: Partial<typeof farmsTable.$inferInsert> = {};
  if (input.level !== undefined) {
    if (!isFarmingLevel(input.level)) throw new FarmDataError(400, 'Diese Art der Bewirtschaftung gibt es nicht.');
    set.farming = input.level;
  }
  if (input.controlBody !== undefined) set.organicControlBody = text(input.controlBody, 40, 'Die Kontrollstelle');
  if (input.organicSince !== undefined) {
    const since = input.organicSince;
    if (since === null || since === '') set.organicSince = null;
    else if (typeof since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(since) || addDays(since, 0) !== since || since > today || since < '1990-01-01') {
      throw new FarmDataError(400, 'Das Datum der Umstellung liegt in der Zukunft oder ist ungültig.');
    } else set.organicSince = since;
  }
  // Back to conventional or natural: the certificate data goes with it.
  if (set.farming !== undefined && !certified(set.farming as FarmingLevel)) {
    set.organicControlBody = null;
    set.organicSince = null;
  }
  if (Object.keys(set).length > 0) await db.update(farmsTable).set(set).where(eq(farmsTable.id, farmId));
  return getFarming(farmId);
}

/**
 * Whether an account gets organic plant advice: its own switch, or a farm it
 * belongs to that farms naturally or organically – then the name of that farm.
 */
export async function organicTipsFor(userId: string): Promise<{ own: boolean; farmName: string | null }> {
  const [settings] = await db.select({ on: userSettingsTable.organicTips }).from(userSettingsTable).where(eq(userSettingsTable.userId, userId));
  const [farm] = await db
    .select({ name: farmsTable.name })
    .from(farmMembershipsTable)
    .innerJoin(farmsTable, eq(farmsTable.id, farmMembershipsTable.farmId))
    .where(and(eq(farmMembershipsTable.userId, userId), ne(farmsTable.farming, 'conventional'), eq(farmsTable.isDemo, false)))
    .orderBy(farmsTable.id)
    .limit(1);
  return { own: settings?.on ?? false, farmName: farm?.name ?? null };
}

/** True when Pflanzendoc and Pflege-Guide name organic means only. */
export async function organicTipsOn(userId: string): Promise<boolean> {
  const t = await organicTipsFor(userId);
  return t.own || t.farmName !== null;
}
