/**
 * Deleting an account – the one place that knows every table with a user id.
 *
 * The user columns have no foreign keys to `users` (they are plain text ids),
 * so removing just the users row leaves everything else behind. This function
 * removes the personal rows and cuts the link from shared content in ONE
 * transaction: either the account is completely gone, or nothing changed.
 *
 * Shared archive entries (plants, insects) stay – other users rely on them and
 * the Nutzungsbedingungen grant their photos to the shared archive – but no
 * longer point at the person. Photos in "Meine Scans" live only on the device,
 * so there is nothing on Cloudinary that belongs to this account alone.
 *
 * Every new table with a user id MUST be added to PERSONAL_TABLES or
 * ARCHIVE_TABLES below, in the same pull request (accountDeletion.test.ts
 * fails otherwise).
 */

import {
  careGuidesTable,
  dashboardLayoutsTable,
  db,
  farmMembershipsTable,
  farmsTable,
  favoritesTable,
  growAccessTable,
  growPushLogTable,
  growsTable,
  insectScansTable,
  insectsTable,
  plantScansTable,
  plantsTable,
  premiumTable,
  pushSubscriptionsTable,
  reportsTable,
  scanAttemptsTable,
  tasksTable,
  userSettingsTable,
  usersTable,
} from '@workspace/db';
import { and, asc, eq, ne } from 'drizzle-orm';

import { deleteFarmPhotos, farmPhotoUrls } from './farmMembers';

/**
 * Tables whose rows belong to one person and go when that person goes. Shared
 * with the one-time cleanup (lib/orphanCleanup.ts) so both always cover the
 * same tables.
 */
export const PERSONAL_TABLES = [
  { name: 'favorites', table: favoritesTable, userId: favoritesTable.userId },
  { name: 'tasks', table: tasksTable, userId: tasksTable.userId },
  { name: 'care_guides', table: careGuidesTable, userId: careGuidesTable.userId },
  {
    name: 'push_subscriptions',
    table: pushSubscriptionsTable,
    userId: pushSubscriptionsTable.userId,
  },
  { name: 'plant_scans', table: plantScansTable, userId: plantScansTable.userId },
  { name: 'insect_scans', table: insectScansTable, userId: insectScansTable.userId },
  { name: 'scan_attempts', table: scanAttemptsTable, userId: scanAttemptsTable.userId },
  // Reports this person filed.
  { name: 'reports', table: reportsTable, userId: reportsTable.userId },
  // Grow: access and the grows (plants and logs go with them).
  { name: 'grow_access', table: growAccessTable, userId: growAccessTable.userId },
  { name: 'grows', table: growsTable, userId: growsTable.userId },
  { name: 'grow_push_log', table: growPushLogTable, userId: growPushLogTable.userId },
  // Modules the account hides, first-start assistant.
  { name: 'user_settings', table: userSettingsTable, userId: userSettingsTable.userId },
  // The Hof-Dashboard the account chose.
  { name: 'dashboard_layouts', table: dashboardLayoutsTable, userId: dashboardLayoutsTable.userId },
  // Premium (granted or, later, paid).
  { name: 'premium', table: premiumTable, userId: premiumTable.userId },
  // Farm memberships – deleteAccount first hands over or removes the farms.
  { name: 'farm_memberships', table: farmMembershipsTable, userId: farmMembershipsTable.userId },
] as const;

/** Shared archive tables: entries stay, only the link to the person is cut. */
export const ARCHIVE_TABLES = [
  { name: 'plants', table: plantsTable, userId: plantsTable.scannedByUserId },
  { name: 'insects', table: insectsTable, userId: insectsTable.scannedByUserId },
] as const;

export class OwnerAccountDeletionError extends Error {
  constructor() {
    super('The owner account cannot be deleted');
    this.name = 'OwnerAccountDeletionError';
  }
}

/**
 * Deletes the account and all of its personal data.
 *
 * Returns false when no such account exists. Throws OwnerAccountDeletionError
 * for the owner: without an owner nobody could approve or moderate accounts,
 * and the next registration would silently become the new owner.
 */
export async function deleteAccount(userId: string): Promise<boolean> {
  // Photos of farms that go with this account, removed from Cloudinary only
  // after the transaction committed.
  const photosToDelete: string[] = [];
  const deleted = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: usersTable.id, isOwner: usersTable.isOwner })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) return false;
    if (user.isOwner) throw new OwnerAccountDeletionError();

    // Farms: a farm whose last member leaves goes with them (cascading to its
    // animals and records); a farm that would lose its last admin gets the
    // longest-standing remaining member as admin, so it is never unmanaged.
    const memberships = await tx
      .select({ farmId: farmMembershipsTable.farmId, role: farmMembershipsTable.role })
      .from(farmMembershipsTable)
      .where(eq(farmMembershipsTable.userId, userId));
    for (const membership of memberships) {
      const others = await tx
        .select({ id: farmMembershipsTable.id, role: farmMembershipsTable.role })
        .from(farmMembershipsTable)
        .where(
          and(
            eq(farmMembershipsTable.farmId, membership.farmId),
            ne(farmMembershipsTable.userId, userId),
          ),
        )
        .orderBy(asc(farmMembershipsTable.createdAt), asc(farmMembershipsTable.id));
      if (others.length === 0) {
        photosToDelete.push(...(await farmPhotoUrls([membership.farmId], tx)));
        await tx.delete(farmsTable).where(eq(farmsTable.id, membership.farmId));
      } else if (membership.role === 'admin' && !others.some((o) => o.role === 'admin')) {
        await tx
          .update(farmMembershipsTable)
          .set({ role: 'admin' })
          .where(eq(farmMembershipsTable.id, others[0]!.id));
      }
    }

    // Personal rows: gone.
    for (const { table, userId: column } of PERSONAL_TABLES) {
      await tx.delete(table).where(eq(column, userId));
    }

    // Reports ABOUT this person's username have nothing left to moderate.
    await tx
      .delete(reportsTable)
      .where(and(eq(reportsTable.contentType, 'username'), eq(reportsTable.contentId, userId)));

    // Shared archive: stays, without the link to the person.
    for (const { table, userId: column } of ARCHIVE_TABLES) {
      await tx.update(table).set({ scannedByUserId: null }).where(eq(column, userId));
    }

    await tx.delete(usersTable).where(eq(usersTable.id, userId));
    return true;
  });
  deleteFarmPhotos(photosToDelete);
  return deleted;
}
