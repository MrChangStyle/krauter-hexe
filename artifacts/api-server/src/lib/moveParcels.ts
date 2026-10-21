/**
 * Umzug über das Konto (docs/landingpage.md): the old address uploads this
 * device's photos and scan queue in small parcels, the new address fetches
 * them after signing in, stores them on its device and deletes them here.
 * Works where two windows cannot talk (installed apps on Android and iPhone).
 *
 * The server only keeps the parcels; their contents are checked when the new
 * address unpacks them (applyMoveBatch). Leftovers go after KEEP_DAYS.
 */

import { db, moveParcelsTable } from '@workspace/db';
import { and, asc, count, eq, gt, lt, sum } from 'drizzle-orm';

import { FarmDataError } from './farmAnimals';

export const MAX_PARCEL_BYTES = 12 * 1024 * 1024;
export const MAX_ACCOUNT_BYTES = 150 * 1024 * 1024;
export const KEEP_DAYS = 14;

export interface MoveStatus {
  parcels: number;
  entries: number;
}

async function purgeOld(now: Date): Promise<void> {
  await db.delete(moveParcelsTable).where(lt(moveParcelsTable.createdAt, new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000)));
}

export async function moveStatus(userId: string, now = new Date()): Promise<MoveStatus> {
  await purgeOld(now);
  const [row] = await db
    .select({ parcels: count(), entries: sum(moveParcelsTable.entries) })
    .from(moveParcelsTable)
    .where(eq(moveParcelsTable.userId, userId));
  return { parcels: row?.parcels ?? 0, entries: Number(row?.entries ?? 0) };
}

/** Stores one parcel (a MoveBatch object). */
export async function putParcel(userId: string, batch: unknown, entries: unknown, now = new Date()): Promise<MoveStatus> {
  if (!batch || typeof batch !== 'object' || Array.isArray(batch)) throw new FarmDataError(400, 'Das Paket ist ungültig.');
  const n = Number(entries);
  if (!Number.isInteger(n) || n < 0 || n > 1000) throw new FarmDataError(400, 'Das Paket ist ungültig.');
  const payload = JSON.stringify(batch);
  const bytes = Buffer.byteLength(payload);
  if (bytes > MAX_PARCEL_BYTES) throw new FarmDataError(413, 'Das Paket ist zu groß.');
  await purgeOld(now);
  const [used] = await db.select({ bytes: sum(moveParcelsTable.bytes) }).from(moveParcelsTable).where(eq(moveParcelsTable.userId, userId));
  if (Number(used?.bytes ?? 0) + bytes > MAX_ACCOUNT_BYTES) {
    throw new FarmDataError(413, 'So viele Fotos passen nicht auf einmal. Nutze bitte „Als Datei sichern“.');
  }
  await db.insert(moveParcelsTable).values({ userId, payload, entries: n, bytes });
  return moveStatus(userId, now);
}

/** The next parcel after `afterId`, or null when all are fetched. */
export async function nextParcel(userId: string, afterId: number): Promise<{ id: number; entries: number; batch: unknown } | null> {
  const [row] = await db
    .select({ id: moveParcelsTable.id, entries: moveParcelsTable.entries, payload: moveParcelsTable.payload })
    .from(moveParcelsTable)
    .where(and(eq(moveParcelsTable.userId, userId), gt(moveParcelsTable.id, afterId)))
    .orderBy(asc(moveParcelsTable.id))
    .limit(1);
  return row ? { id: row.id, entries: row.entries, batch: JSON.parse(row.payload) as unknown } : null;
}

/** After the new address stored everything, or to start over. */
export async function clearParcels(userId: string): Promise<void> {
  await db.delete(moveParcelsTable).where(eq(moveParcelsTable.userId, userId));
}
