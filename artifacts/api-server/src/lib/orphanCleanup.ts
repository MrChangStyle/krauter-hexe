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

import { db, farmMembershipsTable, farmsTable, usersTable } from '@workspace/db';
import { and, isNotNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import { ARCHIVE_TABLES, PERSONAL_TABLES } from './accountDeletion';
import { deleteFarmPhotos, farmPhotoUrls } from './farmMembers';

/** Rows per table that point at an account which no longer exists. */
export type OrphanCounts = Record<string, number>;

/** True when the user id in `column` is set but has no matching account. */
function orphaned(column: PgColumn): SQL | undefined {
  return and(
    isNotNull(column),
    sql`NOT EXISTS (SELECT 1 FROM ${usersTable} WHERE ${usersTable.id} = ${column})`,
  );
}

/**
 * A farm none of whose members still has an account. Such farms go with
 * their animals and records – the same as deleteAccount does for a farm whose
 * last member leaves.
 */
const farmWithoutLivingMembers = sql`NOT EXISTS (
  SELECT 1 FROM ${farmMembershipsTable}
  JOIN ${usersTable} ON ${usersTable.id} = ${farmMembershipsTable.userId}
  WHERE ${farmMembershipsTable.farmId} = ${farmsTable.id}
)`;

/** Counts leftover rows without changing anything. */
export async function findOrphanedData(): Promise<OrphanCounts> {
  const counts: OrphanCounts = {};
  const [farms] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(farmsTable)
    .where(farmWithoutLivingMembers);
  counts['farms'] = farms?.count ?? 0;
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
  const photosToDelete: string[] = [];
  const result = await db.transaction(async (tx) => {
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
    // With the orphaned memberships gone, a farm without any member left is one
    // whose members all had their accounts removed: it goes, cascading to its
    // animals and records. Same set findOrphanedData counted as "farms".
    const memberless = sql`NOT EXISTS (SELECT 1 FROM ${farmMembershipsTable} WHERE ${farmMembershipsTable.farmId} = ${farmsTable.id})`;
    const doomed = await tx.select({ id: farmsTable.id }).from(farmsTable).where(memberless);
    photosToDelete.push(...(await farmPhotoUrls(doomed.map((f) => f.id), tx)));
    const farms = await tx.delete(farmsTable).where(memberless).returning({ id: farmsTable.id });
    counts['farms'] = farms.length;
    // A shared farm that just lost its only admin gets its longest-standing
    // member as admin, as deleteAccount would have done.
    await tx.execute(sql`
      UPDATE ${farmMembershipsTable} SET role = 'admin'
      WHERE id IN (
        SELECT DISTINCT ON (m.farm_id) m.id
        FROM ${farmMembershipsTable} m
        WHERE NOT EXISTS (
          SELECT 1 FROM ${farmMembershipsTable} a WHERE a.farm_id = m.farm_id AND a.role = 'admin'
        )
        ORDER BY m.farm_id, m.created_at, m.id
      )`);
    return counts;
  });
  deleteFarmPhotos(photosToDelete);
  return result;
}
