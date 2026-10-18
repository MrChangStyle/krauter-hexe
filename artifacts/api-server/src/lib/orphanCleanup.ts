/**
 * One-time cleanup of data left behind by accounts deleted before
 * deleteAccount existed.
 *
 * Until then, removing an account in the user management only deleted the
 * users row; favourites, tasks, care guides, push subscriptions and scan
 * history stayed, pointing at an id that no longer exists. This finds those
 * rows and – only when the owner confirms – removes them exactly as
 * deleteAccount would have: personal rows are deleted, shared archive entries
 * only lose the link to the person.
 *
 * Uses the same table lists as deleteAccount, so the two can never disagree
 * about what belongs to an account.
 */

import { db, usersTable } from '@workspace/db';
import { and, isNotNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import { ARCHIVE_TABLES, PERSONAL_TABLES } from './accountDeletion';

/** Rows per table that point at an account which no longer exists. */
export type OrphanCounts = Record<string, number>;

/** True when the user id in `column` is set but has no matching account. */
function orphaned(column: PgColumn): SQL | undefined {
  return and(
    isNotNull(column),
    sql`NOT EXISTS (SELECT 1 FROM ${usersTable} WHERE ${usersTable.id} = ${column})`,
  );
}

/** Counts leftover rows without changing anything. */
export async function findOrphanedData(): Promise<OrphanCounts> {
  const counts: OrphanCounts = {};
  for (const { name, table, userId } of [...PERSONAL_TABLES, ...ARCHIVE_TABLES]) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(table)
      .where(orphaned(userId));
    counts[name] = row?.count ?? 0;
  }
  return counts;
}

/**
 * Removes leftover rows in one transaction and reports how many rows each
 * table lost (personal tables) or had unlinked (archive tables).
 */
export async function cleanupOrphanedData(): Promise<OrphanCounts> {
  return db.transaction(async (tx) => {
    const counts: OrphanCounts = {};
    for (const { name, table, userId } of PERSONAL_TABLES) {
      const removed = await tx
        .delete(table)
        .where(orphaned(userId))
        .returning({ userId });
      counts[name] = removed.length;
    }
    for (const { name, table, userId } of ARCHIVE_TABLES) {
      const unlinked = await tx
        .update(table)
        .set({ scannedByUserId: null })
        .where(orphaned(userId))
        .returning({ userId });
      counts[name] = unlinked.length;
    }
    return counts;
  });
}
