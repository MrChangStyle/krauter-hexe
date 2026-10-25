import { Router, type IRouter } from 'express';
import { AddPastureCutBody, CreatePastureBody, EndGrazingBody, GetPasturesResponse, StartGrazingBody, UpdatePastureBody } from '@workspace/api-zod';

import { requireFarm } from '../middlewares/requireFarm';
import { addCut, createPasture, deleteCut, deleteGrazing, deletePasture, endGrazing, pastureOverview, startGrazing, updatePasture } from '../lib/pasture';
import { badRequest, handle, idParam, notFound } from './farmRouteHelpers';

// Weide (docs/weide.md). Reading: every member with the grant; writing:
// caretaker or admin; deleting a pasture: admin. Every change answers with
// all pastures.

const router: IRouter = Router();

const overview = async (farmId: number) => GetPasturesResponse.parse(await pastureOverview(farmId));

router.get(
  '/farms/:farmId/pastures',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(await overview(req.farm!.farmId));
  }),
);

router.post(
  '/farms/:farmId/pastures',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = CreatePastureBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await createPasture(req.farm!.farmId, body.data);
    res.status(201).json(await overview(req.farm!.farmId));
  }),
);

router.put(
  '/farms/:farmId/pastures/:pastureId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const pastureId = idParam(req, 'pastureId');
    if (pastureId === null) return notFound(res);
    const body = UpdatePastureBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await updatePasture(req.farm!.farmId, pastureId, body.data);
    res.json(await overview(req.farm!.farmId));
  }),
);

router.delete(
  '/farms/:farmId/pastures/:pastureId',
  requireFarm('admin'),
  handle(async (req, res) => {
    const pastureId = idParam(req, 'pastureId');
    if (pastureId === null) return notFound(res);
    await deletePasture(req.farm!.farmId, pastureId);
    res.json(await overview(req.farm!.farmId));
  }),
);

router.post(
  '/farms/:farmId/pastures/:pastureId/grazings',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const pastureId = idParam(req, 'pastureId');
    if (pastureId === null) return notFound(res);
    const body = StartGrazingBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await startGrazing(req.farm!.farmId, pastureId, body.data);
    res.status(201).json(await overview(req.farm!.farmId));
  }),
);

router.put(
  '/farms/:farmId/grazings/:grazingId/end',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const grazingId = idParam(req, 'grazingId');
    if (grazingId === null) return notFound(res);
    const body = EndGrazingBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await endGrazing(req.farm!.farmId, grazingId, body.data.endOn);
    res.json(await overview(req.farm!.farmId));
  }),
);

router.delete(
  '/farms/:farmId/grazings/:grazingId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const grazingId = idParam(req, 'grazingId');
    if (grazingId === null) return notFound(res);
    await deleteGrazing(req.farm!.farmId, grazingId);
    res.json(await overview(req.farm!.farmId));
  }),
);

router.post(
  '/farms/:farmId/pastures/:pastureId/cuts',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const pastureId = idParam(req, 'pastureId');
    if (pastureId === null) return notFound(res);
    const body = AddPastureCutBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await addCut(req.farm!.farmId, pastureId, body.data);
    res.status(201).json(await overview(req.farm!.farmId));
  }),
);

router.delete(
  '/farms/:farmId/pasture-cuts/:cutId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const cutId = idParam(req, 'cutId');
    if (cutId === null) return notFound(res);
    await deleteCut(req.farm!.farmId, cutId);
    res.json(await overview(req.farm!.farmId));
  }),
);

export default router;
