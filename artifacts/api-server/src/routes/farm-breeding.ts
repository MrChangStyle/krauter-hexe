import { Router, type IRouter } from 'express';
import {
  AddHeatBody,
  AddHeatResponse,
  CreateBreedingBody,
  CreateBreedingResponse,
  DeleteHeatResponse,
  EndBreedingBody,
  EndBreedingResponse,
  GetBreedingCyclesResponse,
  GetLineageResponse,
  ListBreedingResponse,
  SetLineageBody,
  SetLineageResponse,
  UpdateBreedingBody,
  UpdateBreedingResponse,
} from '@workspace/api-zod';

import { requireFarm } from '../middlewares/requireFarm';
import { createBreeding, deleteBreeding, endBreeding, lineage, listBreeding, setLineage, updateBreeding } from '../lib/breeding';
import { addHeat, breedingCycles, deleteHeat } from '../lib/breedingCycle';
import { badRequest, handle, idParam, notFound } from './farmRouteHelpers';

// Zucht: matings, clutches and the parents of the animals. Reading: every
// member; writing: caretaker or admin.

const router: IRouter = Router();

router.get(
  '/farms/:farmId/breeding',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(ListBreedingResponse.parse(await listBreeding(req.farm!.farmId)));
  }),
);

// Brunstkalender and weaning – before /breeding/:recordId.
router.get(
  '/farms/:farmId/breeding/cycles',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(GetBreedingCyclesResponse.parse(await breedingCycles(req.farm!.farmId)));
  }),
);

router.post(
  '/farms/:farmId/breeding/heats',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = AddHeatBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(AddHeatResponse.parse(await addHeat(req.farm!.farmId, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/breeding/heats/:heatId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const id = idParam(req, 'heatId');
    if (id === null) return notFound(res);
    res.json(DeleteHeatResponse.parse(await deleteHeat(req.farm!.farmId, id)));
  }),
);

router.post(
  '/farms/:farmId/breeding',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = CreateBreedingBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(CreateBreedingResponse.parse(await createBreeding(req.farm!.farmId, body.data)));
  }),
);

router.put(
  '/farms/:farmId/breeding/:recordId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const id = idParam(req, 'recordId');
    if (id === null) return notFound(res);
    const body = UpdateBreedingBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(UpdateBreedingResponse.parse(await updateBreeding(req.farm!.farmId, id, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/breeding/:recordId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const id = idParam(req, 'recordId');
    if (id === null) return notFound(res);
    await deleteBreeding(req.farm!.farmId, id);
    res.sendStatus(204);
  }),
);

router.post(
  '/farms/:farmId/breeding/:recordId/end',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const id = idParam(req, 'recordId');
    if (id === null) return notFound(res);
    const body = EndBreedingBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(EndBreedingResponse.parse(await endBreeding(req.farm!.farmId, id, body.data)));
  }),
);

router.get(
  '/farms/:farmId/animals/:animalId/lineage',
  requireFarm('guest'),
  handle(async (req, res) => {
    const id = idParam(req, 'animalId');
    if (id === null) return notFound(res);
    res.json(GetLineageResponse.parse(await lineage(req.farm!.farmId, id)));
  }),
);

router.put(
  '/farms/:farmId/animals/:animalId/lineage',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const id = idParam(req, 'animalId');
    if (id === null) return notFound(res);
    const body = SetLineageBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(SetLineageResponse.parse(await setLineage(req.farm!.farmId, id, body.data)));
  }),
);

export default router;
