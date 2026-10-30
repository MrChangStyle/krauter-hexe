/**
 * Nutzer-ID (docs/konto.md): every account gets a short number of its own –
 * 1000–9999, and once most of those are taken 10000–99999 and so on. The
 * account passes it on; with it, an admin adds the person to a farm (Team,
 * Vertretung, Tierarzt) and anyone shares a list. The number alone reveals
 * nothing; adding someone needs the number, and the person then sees whose
 * farm or list it is.
 */

import { db, usersTable } from '@workspace/db';
import { and, count, eq, isNotNull, isNull } from 'drizzle-orm';

/** Smallest and largest code with this many digits. */
function range(digits: number): [number, number] {
  return [10 ** (digits - 1), 10 ** digits - 1];
}

/** Digits for the next code: the shortest length still at most 80 % used. */
export function digitsFor(taken: number): number {
  let digits = 4;
  let capacity = 0;
  for (;;) {
    const [lo, hi] = range(digits);
    capacity += hi - lo + 1;
    if (taken < capacity * 0.8) return digits;
    digits++;
  }
}

/** Read as a Nutzer-ID: 4 or more digits, no leading zero; null otherwise. */
export function parseUserCode(raw: unknown): number | null {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.replace(/[\s#-]/g, '') : '';
  return /^[1-9]\d{3,6}$/.test(text) ? Number(text) : null;
}

/** Hands the account its Nutzer-ID unless it has one; returns it. */
export async function assignUserCode(userId: string): Promise<number> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt++) {
    const [row] = await db.select({ code: usersTable.userCode }).from(usersTable).where(eq(usersTable.id, userId));
    if (!row) throw new Error('No such account');
    if (row.code !== null) return row.code;
    const [{ n }] = await db.select({ n: count() }).from(usersTable).where(isNotNull(usersTable.userCode));
    const [lo, hi] = range(digitsFor(n ?? 0));
    const code = lo + Math.floor(Math.random() * (hi - lo + 1));
    try {
      const [set] = await db
        .update(usersTable)
        .set({ userCode: code })
        .where(and(eq(usersTable.id, userId), isNull(usersTable.userCode)))
        .returning({ code: usersTable.userCode });
      if (set?.code !== null && set?.code !== undefined) return set.code;
    } catch (err) {
      // Taken by someone else meanwhile (unique index) – draw again.
      lastError = err;
    }
  }
  throw new Error('No free Nutzer-ID found', { cause: lastError });
}

/** At start: every account without a Nutzer-ID gets one. */
export async function assignMissingUserCodes(): Promise<number> {
  const rows = await db.select({ id: usersTable.id }).from(usersTable).where(isNull(usersTable.userCode));
  for (const r of rows) await assignUserCode(r.id);
  return rows.length;
}

/** The active, approved account with this Nutzer-ID, or null. */
export async function accountByCode(raw: unknown): Promise<{ id: string } | null> {
  const code = parseUserCode(raw);
  if (code === null) return null;
  const [u] = await db
    .select({ id: usersTable.id, approved: usersTable.approved, blockedAt: usersTable.blockedAt })
    .from(usersTable)
    .where(eq(usersTable.userCode, code));
  return u && u.approved && !u.blockedAt ? { id: u.id } : null;
}
