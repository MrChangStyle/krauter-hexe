import { Router, type IRouter } from 'express';
import { db, farmMembershipsTable, farmsTable } from '@workspace/db';
import { asc, eq } from 'drizzle-orm';
import { GetFarmResponse, ListMyFarmsResponse } from '@workspace/api-zod';

import { requireApproved } from '../middlewares/requireApproved';
import { requireFarm } from '../middlewares/requireFarm';

const router: IRouter = Router();

// The farms the signed-in account belongs to, with its role on each.
router.get('/farms', requireApproved, async (req, res): Promise<void> => {
  const rows = await db
    .select({ id: farmsTable.id, name: farmsTable.name, role: farmMembershipsTable.role })
    .from(farmMembershipsTable)
    .innerJoin(farmsTable, eq(farmsTable.id, farmMembershipsTable.farmId))
    .where(eq(farmMembershipsTable.userId, req.user!.id))
    .orderBy(asc(farmMembershipsTable.createdAt));
  res.json(ListMyFarmsResponse.parse(rows));
});

// One farm – only for its members (requireFarm answers 404 to everyone else).
router.get('/farms/:farmId', requireFarm('guest'), async (req, res): Promise<void> => {
  const { farmId, role } = req.farm!;
  const [farm] = await db
    .select({ id: farmsTable.id, name: farmsTable.name })
    .from(farmsTable)
    .where(eq(farmsTable.id, farmId));
  if (!farm) {
    res.status(404).json({ error: 'Farm nicht gefunden.' });
    return;
  }
  res.json(GetFarmResponse.parse({ ...farm, role }));
});

export default router;
