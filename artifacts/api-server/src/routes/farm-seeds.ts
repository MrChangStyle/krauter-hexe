import { Router, type IRouter } from 'express';
import {
  CreateSeedBody,
  CreateSeedResponse,
  GetSeedOverviewResponse,
  RecordGerminationTestBody,
  RecordGerminationTestResponse,
  UpdateSeedBody,
  UpdateSeedResponse,
} from '@workspace/api-zod';

import { requireFarm } from '../middlewares/requireFarm';
import { createSeed, deleteSeed, recordTest, seedOverview, updateSeed } from '../lib/seeds';
import { badRequest, handle, idParam, notFound } from './farmRouteHelpers';

// Saatgut: the farm's seeds. Reading: every member; writing: caretaker or admin.

const router: IRouter = Router();

router.get(
  '/farms/:farmId/seeds',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(GetSeedOverviewResponse.parse(await seedOverview(req.farm!.farmId)));
  }),
);

router.post(
  '/farms/:farmId/seeds',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = CreateSeedBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(CreateSeedResponse.parse(await createSeed(req.farm!.farmId, body.data)));
  }),
);

router.put(
  '/farms/:farmId/seeds/:seedId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const id = idParam(req, 'seedId');
    if (id === null) return notFound(res);
    const body = UpdateSeedBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(UpdateSeedResponse.parse(await updateSeed(req.farm!.farmId, id, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/seeds/:seedId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const id = idParam(req, 'seedId');
    if (id === null) return notFound(res);
    await deleteSeed(req.farm!.farmId, id);
    res.sendStatus(204);
  }),
);

router.post(
  '/farms/:farmId/seeds/:seedId/test',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const id = idParam(req, 'seedId');
    if (id === null) return notFound(res);
    const body = RecordGerminationTestBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(RecordGerminationTestResponse.parse(await recordTest(req.farm!.farmId, id, body.data)));
  }),
);

export default router;
