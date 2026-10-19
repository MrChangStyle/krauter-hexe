import { Router, type IRouter, type Response } from 'express';
import { db, farmMembershipsTable, farmsTable } from '@workspace/db';
import { and, asc, eq, gte, isNull, or } from 'drizzle-orm';
import {
  AddFarmMemberBody,
  AddFarmMemberResponse,
  ChangeFarmMemberRoleBody,
  ChangeFarmMemberRoleResponse,
  CreateFarmBody,
  CreateFarmResponse,
  DeleteFarmBody,
  DismissFarmSetupBody,
  DismissFarmSetupResponse,
  EnsureOwnFarmResponse,
  FarmQuickStartBody,
  FarmQuickStartResponse,
  GetFarmSetupResponse,
  GetFarmResponse,
  GetHandoverResponse,
  ListFarmMembersResponse,
  ListMyFarmsResponse,
  RenameFarmBody,
  RenameFarmResponse,
  SetHandoverNoteBody,
  SetHandoverNoteResponse,
} from '@workspace/api-zod';

import { handover, setHandoverNote } from '../lib/farmHandover';
import { FarmDataError } from '../lib/farmAnimals';
import { dismissSetup, farmSetup, quickStart } from '../lib/farmSetup';
import { berlinDay } from '../lib/monitoring';
import { requireApproved } from '../middlewares/requireApproved';
import { requireFarm } from '../middlewares/requireFarm';
import {
  FarmError,
  addMember,
  changeRole,
  createFarm,
  deleteFarm,
  ensureOwnFarm,
  listMembers,
  removeMember,
  renameFarm,
} from '../lib/farmMembers';

const router: IRouter = Router();

function sendFarmError(res: Response, err: unknown): boolean {
  if (err instanceof FarmError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

async function myFarms(userId: string) {
  return db
    .select({ id: farmsTable.id, name: farmsTable.name, role: farmMembershipsTable.role, accessUntil: farmMembershipsTable.accessUntil })
    .from(farmMembershipsTable)
    .innerJoin(farmsTable, eq(farmsTable.id, farmMembershipsTable.farmId))
    .where(
      and(
        eq(farmMembershipsTable.userId, userId),
        or(isNull(farmMembershipsTable.accessUntil), gte(farmMembershipsTable.accessUntil, berlinDay())),
      ),
    )
    .orderBy(asc(farmMembershipsTable.createdAt), asc(farmMembershipsTable.id));
}

// The farms the signed-in account belongs to, with its role on each.
router.get('/farms', requireApproved, async (req, res): Promise<void> => {
  res.json(ListMyFarmsResponse.parse(await myFarms(req.user!.id)));
});

// First visit of "Meine Farm": the account gets a farm of its own.
router.post('/farms/ensure-own', requireApproved, async (req, res): Promise<void> => {
  await ensureOwnFarm(req.user!.id);
  res.json(EnsureOwnFarmResponse.parse(await myFarms(req.user!.id)));
});

router.post('/farms', requireApproved, async (req, res): Promise<void> => {
  const body = CreateFarmBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Der Name muss 1 bis 60 Zeichen lang sein.' });
    return;
  }
  try {
    const id = await createFarm(req.user!.id, body.data.name);
    const farm = (await myFarms(req.user!.id)).find((f) => f.id === id)!;
    res.status(201).json(CreateFarmResponse.parse(farm));
  } catch (err) {
    if (!sendFarmError(res, err)) throw err;
  }
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

router.patch('/farms/:farmId', requireFarm('admin'), async (req, res): Promise<void> => {
  const body = RenameFarmBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Der Name muss 1 bis 60 Zeichen lang sein.' });
    return;
  }
  try {
    const name = await renameFarm(req.farm!.farmId, body.data.name);
    res.json(RenameFarmResponse.parse({ id: req.farm!.farmId, name, role: req.farm!.role }));
  } catch (err) {
    if (!sendFarmError(res, err)) throw err;
  }
});

router.delete('/farms/:farmId', requireFarm('admin'), async (req, res): Promise<void> => {
  const body = DeleteFarmBody.safeParse(req.body);
  try {
    await deleteFarm(req.farm!.farmId, body.success ? body.data.confirmName : undefined);
    res.sendStatus(204);
  } catch (err) {
    if (!sendFarmError(res, err)) throw err;
  }
});

// ── Members ───────────────────────────────────────────────────────────────────

router.get('/farms/:farmId/members', requireFarm('guest'), async (req, res): Promise<void> => {
  res.json(ListFarmMembersResponse.parse(await listMembers(req.farm!.farmId, req.farm!)));
});

router.post('/farms/:farmId/members', requireFarm('admin'), async (req, res): Promise<void> => {
  const body = AddFarmMemberBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Bitte gib eine E-Mail-Adresse und eine Rolle an.' });
    return;
  }
  try {
    await addMember(req.farm!.farmId, req.farm!.userId, body.data.email, body.data.role, body.data.accessUntil);
    res.json(AddFarmMemberResponse.parse(await listMembers(req.farm!.farmId, req.farm!)));
  } catch (err) {
    if (!sendFarmError(res, err)) throw err;
  }
});

router.patch(
  '/farms/:farmId/members/:userId',
  requireFarm('admin'),
  async (req, res): Promise<void> => {
    const body = ChangeFarmMemberRoleBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Ungültige Rolle.' });
      return;
    }
    try {
      await changeRole(req.farm!.farmId, String(req.params['userId']), body.data.role, body.data.accessUntil);
      res.json(ChangeFarmMemberRoleResponse.parse(await listMembers(req.farm!.farmId, req.farm!)));
    } catch (err) {
      if (!sendFarmError(res, err)) throw err;
    }
  },
);

// Admins remove anyone; every member can remove themselves (leave).
router.delete(
  '/farms/:farmId/members/:userId',
  requireFarm('guest'),
  async (req, res): Promise<void> => {
    try {
      await removeMember(req.farm!.farmId, req.farm!, String(req.params['userId']));
      res.sendStatus(204);
    } catch (err) {
      if (!sendFarmError(res, err)) throw err;
    }
  },
);

// ── Vertretung ────────────────────────────────────────────────────────────────

router.get('/farms/:farmId/handover', requireFarm('guest'), async (req, res): Promise<void> => {
  res.json(GetHandoverResponse.parse(await handover(req.farm!.farmId, req.farm!.userId)));
});

router.put('/farms/:farmId/handover-note', requireFarm('admin'), async (req, res): Promise<void> => {
  const body = SetHandoverNoteBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Die Notiz darf höchstens 2000 Zeichen lang sein.' });
    return;
  }
  await setHandoverNote(req.farm!.farmId, body.data.note);
  res.json(SetHandoverNoteResponse.parse(await handover(req.farm!.farmId, req.farm!.userId)));
});

// ── Hof einrichten ────────────────────────────────────────────────────────────

router.get('/farms/:farmId/setup', requireFarm('guest'), async (req, res): Promise<void> => {
  res.json(GetFarmSetupResponse.parse(await farmSetup(req.farm!.farmId)));
});

router.put('/farms/:farmId/setup', requireFarm('admin'), async (req, res): Promise<void> => {
  const body = DismissFarmSetupBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Bitte prüfe deine Eingaben.' });
    return;
  }
  res.json(DismissFarmSetupResponse.parse(await dismissSetup(req.farm!.farmId, body.data.dismissed)));
});

router.post('/farms/:farmId/setup/quickstart', requireFarm('admin'), async (req, res): Promise<void> => {
  const body = FarmQuickStartBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Bitte wähle eine Tierart und 1 bis 50 Tiere.' });
    return;
  }
  try {
    res.status(201).json(FarmQuickStartResponse.parse(await quickStart(req.farm!.farmId, body.data)));
  } catch (err) {
    if (err instanceof FarmDataError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
