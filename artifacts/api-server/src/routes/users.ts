import { Router, type IRouter } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db, usersTable } from '@workspace/db';
import {
  ListUsersResponse,
  UpdateUserApprovalParams,
  UpdateUserApprovalBody,
  UpdateUserApprovalResponse,
  DeleteUserParams,
  GetOrphanedDataResponse,
  CleanupOrphanedDataBody,
  CleanupOrphanedDataResponse,
} from '@workspace/api-zod';
import { requireOwner } from '../middlewares/requireApproved';
import { OwnerAccountDeletionError, SubscriptionStillRunningError, deleteAccount } from '../lib/accountDeletion';
import {
  cleanupOrphanedData,
  findOrphanedData,
  type OrphanCounts,
} from '../lib/orphanCleanup';

const router: IRouter = Router();

// Revoking access takes effect on the next request: every request re-reads the
// user row, so an unapproved or deleted account is locked out immediately
// without any session bookkeeping here.

router.get('/users', requireOwner, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      profileImageUrl: usersTable.profileImageUrl,
      approved: usersTable.approved,
      isOwner: usersTable.isOwner,
      username: usersTable.username,
      leavesCount: usersTable.leavesCount,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.isOwner), usersTable.createdAt);

  res.json(ListUsersResponse.parse(rows));
});

// ── Data left behind by deleted accounts ─────────────────────────────────────
// Before deleteAccount existed, removing an account only deleted the users
// row. The owner first looks (GET, changes nothing), then confirms (POST).

function report(counts: OrphanCounts) {
  return {
    counts,
    total: Object.values(counts).reduce((sum, n) => sum + n, 0),
  };
}

router.get('/users/orphaned-data', requireOwner, async (_req, res): Promise<void> => {
  res.json(GetOrphanedDataResponse.parse(report(await findOrphanedData())));
});

router.post(
  '/users/orphaned-data/cleanup',
  requireOwner,
  async (req, res): Promise<void> => {
    const body = CleanupOrphanedDataBody.safeParse(req.body);
    if (!body.success || body.data.confirm !== true) {
      res.status(400).json({ error: 'Bitte bestätige die Bereinigung.' });
      return;
    }
    const counts = await cleanupOrphanedData();
    req.log.info({ counts }, 'Orphaned account data cleaned up');
    res.json(CleanupOrphanedDataResponse.parse(report(counts)));
  },
);

router.patch('/users/:id', requireOwner, async (req, res): Promise<void> => {
  const params = UpdateUserApprovalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateUserApprovalBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [target] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));

  if (!target) {
    res.status(404).json({ error: 'Konto nicht gefunden' });
    return;
  }
  if (target.isOwner) {
    res
      .status(400)
      .json({ error: 'Das Besitzer-Konto kann nicht geändert werden.' });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    // Approving again also lifts a moderation block.
    .set(body.data.approved ? { approved: true, blockedAt: null } : { approved: false })
    .where(eq(usersTable.id, params.data.id))
    .returning();

  res.json(UpdateUserApprovalResponse.parse(updated));
});

router.delete('/users/:id', requireOwner, async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Same complete deletion as when users delete themselves – removing only the
  // users row used to leave favourites, tasks, push subscriptions and scan
  // history behind.
  let deleted: boolean;
  try {
    deleted = await deleteAccount(params.data.id);
  } catch (err) {
    if (err instanceof OwnerAccountDeletionError) {
      res
        .status(400)
        .json({ error: 'Das Besitzer-Konto kann nicht entfernt werden.' });
      return;
    }
    if (err instanceof SubscriptionStillRunningError) {
      res.status(502).json({ error: err.message });
      return;
    }
    throw err;
  }

  if (!deleted) {
    res.status(404).json({ error: 'Konto nicht gefunden' });
    return;
  }

  res.sendStatus(204);
});

export default router;
