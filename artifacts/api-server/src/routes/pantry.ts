import { Router, type IRouter } from 'express';
import { CreatePantryItemBody, GetPantryResponse, TakeFromPantryBody, UpdatePantryItemBody } from '@workspace/api-zod';

import { requireFarm } from '../middlewares/requireFarm';
import { createItem, deleteItem, pantryOverview, takeOut, undoUse, updateItem } from '../lib/pantry';
import { badRequest, handle, idParam, notFound } from './farmRouteHelpers';

// Vorratskammer (docs/vorratskammer.md). Reading: every member with the
// grant; writing: caretaker or admin. Every change answers with the pantry.

const router: IRouter = Router();

const overview = async (farmId: number) => GetPantryResponse.parse(await pantryOverview(farmId));

router.get(
  '/farms/:farmId/pantry',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(await overview(req.farm!.farmId));
  }),
);

router.post(
  '/farms/:farmId/pantry',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = CreatePantryItemBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await createItem(req.farm!.farmId, body.data);
    res.status(201).json(await overview(req.farm!.farmId));
  }),
);

router.put(
  '/farms/:farmId/pantry/:itemId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const itemId = idParam(req, 'itemId');
    if (itemId === null) return notFound(res);
    const body = UpdatePantryItemBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await updateItem(req.farm!.farmId, itemId, body.data);
    res.json(await overview(req.farm!.farmId));
  }),
);

router.delete(
  '/farms/:farmId/pantry/:itemId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const itemId = idParam(req, 'itemId');
    if (itemId === null) return notFound(res);
    await deleteItem(req.farm!.farmId, itemId);
    res.json(await overview(req.farm!.farmId));
  }),
);

router.post(
  '/farms/:farmId/pantry/:itemId/take',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const itemId = idParam(req, 'itemId');
    if (itemId === null) return notFound(res);
    const body = TakeFromPantryBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await takeOut(req.farm!.farmId, itemId, body.data.amount, body.data.date);
    res.json(await overview(req.farm!.farmId));
  }),
);

router.delete(
  '/farms/:farmId/pantry/:itemId/uses/:useId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const itemId = idParam(req, 'itemId');
    const useId = idParam(req, 'useId');
    if (itemId === null || useId === null) return notFound(res);
    await undoUse(req.farm!.farmId, itemId, useId);
    res.json(await overview(req.farm!.farmId));
  }),
);

export default router;
