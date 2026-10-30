import { Router, type IRouter } from 'express';
import {
  CreateFarmAnimalBody,
  CreateFarmAnimalResponse,
  CreateHerdBody,
  CreateHerdResponse,
  GetFarmAnimalResponse,
  ListFarmAnimalsResponse,
  ListHerdsResponse,
  SetFarmAnimalArchivedBody,
  SetFarmAnimalArchivedResponse,
  SetFarmAnimalPhotoBody,
  SetFarmAnimalPhotoResponse,
  UpdateFarmAnimalBody,
  UpdateFarmAnimalResponse,
  UpdateHerdBody,
  SetHerdSpaceBody,
  SetHerdSpaceResponse,
  UpdateHerdResponse,
} from '@workspace/api-zod';

import { requireFarm } from '../middlewares/requireFarm';
import {
  createAnimal,
  createHerd,
  deleteHerd,
  setHerdSpace,
  getAnimal,
  listAnimals,
  listHerds,
  setArchived,
  setPhoto,
  updateAnimal,
  updateHerd,
} from '../lib/farmAnimals';
import { badRequest, handle, idParam, notFound } from './farmRouteHelpers';

// Herds and animals of one farm. Reading: every member; writing: caretaker
// or admin. Every handler passes req.farm.farmId down – ids from another farm
// are "not found".

const router: IRouter = Router();

// ── Herds ────────────────────────────────────────────────────────────────────

router.get(
  '/farms/:farmId/herds',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(ListHerdsResponse.parse(await listHerds(req.farm!.farmId)));
  }),
);

router.post(
  '/farms/:farmId/herds',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = CreateHerdBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(CreateHerdResponse.parse(await createHerd(req.farm!.farmId, body.data)));
  }),
);

router.patch(
  '/farms/:farmId/herds/:herdId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const herdId = idParam(req, 'herdId');
    if (herdId === null) return notFound(res);
    const body = UpdateHerdBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(UpdateHerdResponse.parse(await updateHerd(req.farm!.farmId, herdId, body.data)));
  }),
);

// Platz-Check (Bio, docs/bio.md).
router.put(
  '/farms/:farmId/herds/:herdId/space',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const herdId = idParam(req, 'herdId');
    if (herdId === null) return notFound(res);
    const body = SetHerdSpaceBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(SetHerdSpaceResponse.parse(await setHerdSpace(req.farm!.farmId, herdId, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/herds/:herdId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const herdId = idParam(req, 'herdId');
    if (herdId === null) return notFound(res);
    await deleteHerd(req.farm!.farmId, herdId);
    res.sendStatus(204);
  }),
);

// ── Animals ──────────────────────────────────────────────────────────────────

router.get(
  '/farms/:farmId/animals',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(ListFarmAnimalsResponse.parse(await listAnimals(req.farm!.farmId)));
  }),
);

router.post(
  '/farms/:farmId/animals',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = CreateFarmAnimalBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(CreateFarmAnimalResponse.parse(await createAnimal(req.farm!.farmId, body.data)));
  }),
);

router.get(
  '/farms/:farmId/animals/:animalId',
  requireFarm('guest'),
  handle(async (req, res) => {
    const animalId = idParam(req, 'animalId');
    if (animalId === null) return notFound(res);
    res.json(GetFarmAnimalResponse.parse(await getAnimal(req.farm!.farmId, animalId)));
  }),
);

router.patch(
  '/farms/:farmId/animals/:animalId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const animalId = idParam(req, 'animalId');
    if (animalId === null) return notFound(res);
    const body = UpdateFarmAnimalBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(UpdateFarmAnimalResponse.parse(await updateAnimal(req.farm!.farmId, animalId, body.data)));
  }),
);

router.post(
  '/farms/:farmId/animals/:animalId/archive',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const animalId = idParam(req, 'animalId');
    if (animalId === null) return notFound(res);
    const body = SetFarmAnimalArchivedBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(
      SetFarmAnimalArchivedResponse.parse(await setArchived(req.farm!.farmId, animalId, body.data.archived)),
    );
  }),
);

router.put(
  '/farms/:farmId/animals/:animalId/photo',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const animalId = idParam(req, 'animalId');
    if (animalId === null) return notFound(res);
    const body = SetFarmAnimalPhotoBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(SetFarmAnimalPhotoResponse.parse(await setPhoto(req.farm!.farmId, animalId, body.data.imageData)));
  }),
);

export default router;
