import { Router, type IRouter } from 'express';
import { AddYieldBody, GetYieldOverviewResponse, ListFarmPricesResponse, SetFarmPriceBody, SetFarmPriceResponse } from '@workspace/api-zod';

import { requireFarm } from '../middlewares/requireFarm';
import { addYield, priceList, removeYield, setPrice, yieldOverview } from '../lib/farmYields';
import { badRequest, handle, idParam, notFound } from './farmRouteHelpers';

// Ertrag & Bilanz. Reading: every member; writing: caretaker or admin.

const router: IRouter = Router();

router.get(
  '/farms/:farmId/yield-overview/:year',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(GetYieldOverviewResponse.parse(await yieldOverview(req.farm!.farmId, req.params.year)));
  }),
);

router.post(
  '/farms/:farmId/yields',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = AddYieldBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await addYield(req.farm!.farmId, body.data);
    res.sendStatus(204);
  }),
);

router.delete(
  '/farms/:farmId/yields/:yieldId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const id = idParam(req, 'yieldId');
    if (id === null) return notFound(res);
    await removeYield(req.farm!.farmId, id);
    res.sendStatus(204);
  }),
);

router.get(
  '/farms/:farmId/prices',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(ListFarmPricesResponse.parse(await priceList(req.farm!.farmId)));
  }),
);

router.put(
  '/farms/:farmId/prices',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = SetFarmPriceBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(SetFarmPriceResponse.parse(await setPrice(req.farm!.farmId, body.data.key, body.data.eur)));
  }),
);

export default router;
