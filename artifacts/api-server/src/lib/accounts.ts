/**
 * Shared account helpers used by both ways in (email + password and Google).
 */

import { db, usersTable } from '@workspace/db';
import { and, eq, sql } from 'drizzle-orm';

import { logger } from './logger';
import { sendPushToUser } from './webPush';

/** Columns that may be sent to the client – never the password hash. */
export const publicUserColumns = {
  id: usersTable.id,
  email: usersTable.email,
  firstName: usersTable.firstName,
  lastName: usersTable.lastName,
  profileImageUrl: usersTable.profileImageUrl,
  approved: usersTable.approved,
  isOwner: usersTable.isOwner,
  username: usersTable.username,
  leavesCount: usersTable.leavesCount,
  blockedAt: usersTable.blockedAt,
  userCode: usersTable.userCode,
};

/**
 * Promotes the very first account to owner. The NOT EXISTS guard handles the
 * common case; the partial unique index users_single_owner_idx is the hard
 * backstop – if two "first" registrations race, exactly one promotion commits
 * and the loser continues as a regular (unapproved) account.
 */
export async function promoteFirstOwner(userId: string) {
  try {
    const [promoted] = await db
      .update(usersTable)
      .set({ isOwner: true, approved: true })
      .where(
        and(
          eq(usersTable.id, userId),
          sql`NOT EXISTS (SELECT 1 FROM ${usersTable} WHERE ${usersTable.isOwner} = true)`,
        ),
      )
      .returning(publicUserColumns);
    return promoted ?? null;
  } catch (err) {
    const code =
      (err as { code?: string })?.code ??
      (err as { cause?: { code?: string } })?.cause?.code;
    // 23505 = unique violation: someone else won the owner race just now.
    if (code !== '23505') throw err;
    return null;
  }
}

const DEFAULT_FREE_TESTER_SLOTS = 20;

/**
 * Testphase: how many accounts (the owner not counted) may start without the
 * owner's approval – FREE_TESTER_SLOTS, default 20; 0 switches it off.
 */
export function freeTesterSlots(): number {
  const raw = process.env['FREE_TESTER_SLOTS'];
  if (raw === undefined || raw.trim() === '') return DEFAULT_FREE_TESTER_SLOTS;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_FREE_TESTER_SLOTS;
}

/**
 * Lets a just-created account in at once while it is among the first
 * freeTesterSlots() accounts besides the owner – the accounts that already
 * exist count too. The place is the account's rank by creation time, so two
 * sign-ups at the same moment cannot both take the last place. Only called
 * when an account is created: an account the owner later locks out stays out.
 */
export async function approveIfFreeTesterSlot(userId: string) {
  const slots = freeTesterSlots();
  if (slots === 0) return null;
  const [approved] = await db
    .update(usersTable)
    .set({ approved: true })
    .where(
      and(
        eq(usersTable.id, userId),
        eq(usersTable.approved, false),
        sql`${usersTable.blockedAt} IS NULL`,
        sql`(SELECT count(*) FROM ${usersTable} o
              WHERE o.is_owner = false
                AND (o.created_at, o.id) <= (SELECT u.created_at, u.id FROM ${usersTable} u WHERE u.id = ${userId})) <= ${slots}`,
      ),
    )
    .returning(publicUserColumns);
  return approved ?? null;
}

/**
 * Push to the owner when someone new signs up: who, and whether the account
 * starts at once (free tester place) or waits for approval. Never throws –
 * a failed push must not fail the sign-up.
 */
export async function notifyOwnerOfNewAccount(user: { id: string; email: string | null; firstName: string | null; approved: boolean }): Promise<void> {
  try {
    const owners = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isOwner, true));
    const who = user.firstName || user.email || 'Jemand';
    for (const owner of owners) {
      if (owner.id === user.id) continue;
      await sendPushToUser(owner.id, {
        topic: 'admin',
        title: 'Neuer Tester',
        body: user.approved ? `${who} hat sich angemeldet und kann sofort loslegen.` : `${who} hat sich angemeldet und wartet auf deine Freischaltung.`,
        tag: 'new-account',
        url: '/verwaltung#benutzer',
      });
    }
  } catch (err) {
    logger.warn({ err }, 'new account push failed');
  }
}
