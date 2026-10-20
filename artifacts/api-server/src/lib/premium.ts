/**
 * Premium (docs/premium.md): what costs money because it costs money to run –
 * for now the AI of the Grow module (KI-Check). Everything without AI stays
 * free.
 *
 * Until there are payments, the owner grants Premium by e-mail, without an end
 * or until a day. The owner always has it. A payment provider will later write
 * the same rows (source, plan, activeUntil); the checks here stay as they are.
 */

import { db, premiumTable, usersTable } from '@workspace/db';
import { asc, eq } from 'drizzle-orm';

import { FarmDataError, validDate } from './farmAnimals';

export interface Premium {
  active: boolean;
  /** Last day (ISO timestamp of its end) or null for no end. */
  until: string | null;
  /** owner | manual | (later) the payment provider; null without Premium. */
  source: string | null;
}

function isActive(row: { activeUntil: Date | null } | undefined, now: Date): boolean {
  return !!row && (row.activeUntil === null || row.activeUntil > now);
}

export async function premiumOf(userId: string, isOwner: boolean, now = new Date()): Promise<Premium> {
  if (isOwner) return { active: true, until: null, source: 'owner' };
  const [row] = await db.select().from(premiumTable).where(eq(premiumTable.userId, userId));
  if (!isActive(row, now)) return { active: false, until: null, source: null };
  return { active: true, until: row!.activeUntil?.toISOString() ?? null, source: row!.source };
}

export interface PremiumEntry {
  email: string | null;
  username: string | null;
  source: string;
  until: string | null;
  active: boolean;
  grantedAt: string;
}

export async function listPremium(now = new Date()): Promise<PremiumEntry[]> {
  const rows = await db
    .select({ email: usersTable.email, username: usersTable.username, source: premiumTable.source, activeUntil: premiumTable.activeUntil, grantedAt: premiumTable.grantedAt })
    .from(premiumTable)
    .innerJoin(usersTable, eq(usersTable.id, premiumTable.userId))
    .orderBy(asc(usersTable.email));
  return rows.map((r) => ({
    email: r.email,
    username: r.username,
    source: r.source,
    until: r.activeUntil?.toISOString() ?? null,
    active: isActive(r, now),
    grantedAt: r.grantedAt.toISOString(),
  }));
}

/**
 * The end of a day for "Premium bis 31.12.": 23:59:59 Berlin time in winter,
 * an hour into the next day in summer – rather generous than short.
 */
function endOfDay(day: string): Date {
  return new Date(`${day}T22:59:59Z`);
}

/** Owner: grant Premium by e-mail (no end, or until a day), or take it back. */
export async function setPremium(input: { email: string; active: boolean; until?: string | null }, now = new Date()): Promise<PremiumEntry[]> {
  const [user] = await db.select({ id: usersTable.id, isOwner: usersTable.isOwner }).from(usersTable).where(eq(usersTable.email, input.email.trim().toLowerCase()));
  if (!user) throw new FarmDataError(404, 'Ein Konto mit dieser E-Mail gibt es nicht.');
  if (user.isOwner) throw new FarmDataError(409, 'Der Betreiber hat Premium immer.');
  if (!input.active) {
    await db.delete(premiumTable).where(eq(premiumTable.userId, user.id));
    return listPremium(now);
  }
  let activeUntil: Date | null = null;
  if (input.until) {
    // A future day: validDate only accepts past days, so check the format with a date far ahead.
    const day = validDate(input.until, 'Enddatum', new Date('2100-01-01T00:00:00Z'));
    activeUntil = endOfDay(day);
    if (activeUntil <= now) throw new FarmDataError(400, 'Das Enddatum liegt in der Vergangenheit.');
  }
  await db
    .insert(premiumTable)
    .values({ userId: user.id, source: 'manual', plan: null, activeUntil })
    .onConflictDoUpdate({ target: premiumTable.userId, set: { source: 'manual', plan: null, activeUntil, grantedAt: now } });
  return listPremium(now);
}
