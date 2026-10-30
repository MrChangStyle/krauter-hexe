/**
 * Nachhaltigkeit (docs/bio.md, B8): a short list of measures a farm can tick,
 * for every level of farming – the basis of the Hof-Steckbrief. The labels
 * live in the app (src/lib/sustainability.ts); the keys must match.
 */

import { db, farmsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { FarmDataError, notFound } from './farmAnimals';

export const SUSTAINABILITY_KEYS = [
  'nest_boxes',
  'insect_hotel',
  'flower_strip',
  'hedge',
  'deadwood',
  'pond',
  'rainwater',
  'compost',
  'mulch',
  'peat_free',
  'old_breeds',
  'solar',
] as const;

export async function getSustainability(farmId: number): Promise<{ keys: string[] }> {
  const [row] = await db.select({ keys: farmsTable.sustainability }).from(farmsTable).where(eq(farmsTable.id, farmId));
  if (!row) throw notFound();
  // Known keys only, in the fixed order.
  return { keys: SUSTAINABILITY_KEYS.filter((k) => row.keys.includes(k)) };
}

export async function setSustainability(farmId: number, keys: unknown): Promise<{ keys: string[] }> {
  if (!Array.isArray(keys) || keys.some((k) => !(SUSTAINABILITY_KEYS as readonly unknown[]).includes(k))) {
    throw new FarmDataError(400, 'Diese Maßnahme gibt es nicht.');
  }
  const set = SUSTAINABILITY_KEYS.filter((k) => keys.includes(k));
  await db.update(farmsTable).set({ sustainability: set }).where(eq(farmsTable.id, farmId));
  return getSustainability(farmId);
}
