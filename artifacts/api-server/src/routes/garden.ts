import { Router, type IRouter } from 'express';
import {
  AddPlantingBody,
  AddPlantingResponse,
  CreateBedBody,
  CreateBedResponse,
  GetBedResponse,
  GetGardenCatalogResponse,
  ListBedsResponse,
  ListPlantingsResponse,
  UpdateBedBody,
  UpdateBedResponse,
} from '@workspace/api-zod';

import { requireApproved } from '../middlewares/requireApproved';
import { requireFarm } from '../middlewares/requireFarm';
import { createBed, deleteBed, getBed, listBeds, updateBed } from '../lib/gardenBeds';
import { GARDEN_CATALOG } from '../lib/gardenCatalog';
import { addPlanting, listPlantings, removePlanting } from '../lib/gardenPlanner';
import { badRequest, handle, idParam, notFound } from './farmRouteHelpers';

// Beet-Architekt: the crop catalog (same for everyone) and the beds of a
// farm (read: every member; write: caretaker or admin).

const router: IRouter = Router();

const catalogJson = GetGardenCatalogResponse.parse(GARDEN_CATALOG);

router.get('/garden/catalog', requireApproved, (_req, res) => {
  res.set('Cache-Control', 'private, max-age=3600');
  res.json(catalogJson);
});

router.get(
  '/farms/:farmId/beds',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(ListBedsResponse.parse(await listBeds(req.farm!.farmId)));
  }),
);

router.post(
  '/farms/:farmId/beds',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = CreateBedBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(CreateBedResponse.parse(await createBed(req.farm!.farmId, body.data)));
  }),
);

router.get(
  '/farms/:farmId/beds/:bedId',
  requireFarm('guest'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    if (bedId === null) return notFound(res);
    res.json(GetBedResponse.parse(await getBed(req.farm!.farmId, bedId)));
  }),
);

router.patch(
  '/farms/:farmId/beds/:bedId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    if (bedId === null) return notFound(res);
    const body = UpdateBedBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(UpdateBedResponse.parse(await updateBed(req.farm!.farmId, bedId, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/beds/:bedId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    if (bedId === null) return notFound(res);
    await deleteBed(req.farm!.farmId, bedId);
    res.sendStatus(204);
  }),
);

// ── Raster-Planer ────────────────────────────────────────────────────────────

router.get(
  '/farms/:farmId/beds/:bedId/seasons/:season/plantings',
  requireFarm('guest'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    const season = idParam(req, 'season');
    if (bedId === null || season === null) return notFound(res);
    res.json(ListPlantingsResponse.parse(await listPlantings(req.farm!.farmId, bedId, season)));
  }),
);

router.post(
  '/farms/:farmId/beds/:bedId/seasons/:season/plantings',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    const season = idParam(req, 'season');
    if (bedId === null || season === null) return notFound(res);
    const body = AddPlantingBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(AddPlantingResponse.parse(await addPlanting(req.farm!.farmId, bedId, season, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/plantings/:plantingId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const plantingId = idParam(req, 'plantingId');
    if (plantingId === null) return notFound(res);
    await removePlanting(req.farm!.farmId, plantingId);
    res.sendStatus(204);
  }),
);

export default router;
