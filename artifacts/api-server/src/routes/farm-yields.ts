import { Router, type IRouter } from 'express';
import { AddExpenseBody, AddSaleBody, AddYieldBody, GetLayingHistoryResponse, GetYieldOverviewResponse, ListFarmPricesResponse, SetFarmPriceBody, SetFarmPriceResponse } from '@workspace/api-zod';

import { requireFarm } from '../middlewares/requireFarm';
import { addExpense, addSale, addYield, priceList, removeExpense, removeSale, removeYield, setPrice, yieldOverview } from '../lib/farmYields';
import { loadLayingHistory } from '../lib/layingHistory';
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

router.get(
  '/farms/:farmId/laying',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(GetLayingHistoryResponse.parse(await loadLayingHistory(req.farm!.farmId)));
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

router.post(
  '/farms/:farmId/expenses',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = AddExpenseBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await addExpense(req.farm!.farmId, body.data);
    res.sendStatus(204);
  }),
);

router.delete(
  '/farms/:farmId/expenses/:expenseId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const id = idParam(req, 'expenseId');
    if (id === null) return notFound(res);
    await removeExpense(req.farm!.farmId, id);
    res.sendStatus(204);
  }),
);

router.post(
  '/farms/:farmId/sales',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = AddSaleBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await addSale(req.farm!.farmId, body.data);
    res.sendStatus(204);
  }),
);

router.delete(
  '/farms/:farmId/sales/:saleId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const id = idParam(req, 'saleId');
    if (id === null) return notFound(res);
    await removeSale(req.farm!.farmId, id);
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
