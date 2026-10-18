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
 * Every new table with a user id MUST be added here, in the same pull request,
 * together with a test (see accountDeletion.test.ts).
 */

import {
  careGuidesTable,
  db,
  favoritesTable,
  insectScansTable,
  insectsTable,
  plantScansTable,
  plantsTable,
  pushSubscriptionsTable,
  scanAttemptsTable,
  tasksTable,
  usersTable,
} from '@workspace/db';
import { eq } from 'drizzle-orm';

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
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: usersTable.id, isOwner: usersTable.isOwner })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) return false;
    if (user.isOwner) throw new OwnerAccountDeletionError();

    // Personal rows: gone.
    await tx.delete(favoritesTable).where(eq(favoritesTable.userId, userId));
    await tx.delete(tasksTable).where(eq(tasksTable.userId, userId));
    await tx.delete(careGuidesTable).where(eq(careGuidesTable.userId, userId));
    await tx.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
    await tx.delete(plantScansTable).where(eq(plantScansTable.userId, userId));
    await tx.delete(insectScansTable).where(eq(insectScansTable.userId, userId));
    await tx.delete(scanAttemptsTable).where(eq(scanAttemptsTable.userId, userId));

    // Shared archive: stays, without the link to the person.
    await tx
      .update(plantsTable)
      .set({ scannedByUserId: null })
      .where(eq(plantsTable.scannedByUserId, userId));
    await tx
      .update(insectsTable)
      .set({ scannedByUserId: null })
      .where(eq(insectsTable.scannedByUserId, userId));

    await tx.delete(usersTable).where(eq(usersTable.id, userId));
    return true;
  });
}
