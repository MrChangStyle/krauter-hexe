/**
 * Shared account helpers used by both ways in (email + password and Google).
 */

import { db, usersTable } from '@workspace/db';
import { and, eq, sql } from 'drizzle-orm';

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
