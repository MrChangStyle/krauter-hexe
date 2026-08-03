import { Router, type IRouter } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db, usersTable } from '@workspace/db';
import {
  ListUsersResponse,
  UpdateUserApprovalParams,
  UpdateUserApprovalBody,
  UpdateUserApprovalResponse,
  DeleteUserParams,
} from '@workspace/api-zod';
import { requireOwner } from '../middlewares/requireApproved';

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
    .set({ approved: body.data.approved })
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
      .json({ error: 'Das Besitzer-Konto kann nicht entfernt werden.' });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, params.data.id));

  res.sendStatus(204);
});

export default router;
