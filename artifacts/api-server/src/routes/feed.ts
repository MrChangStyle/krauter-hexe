import { Router, type IRouter } from 'express';
import {
  AddFarmFeedBody,
  AddFarmFeedResponse,
  GetFeedReferenceResponse,
  ListFarmFeedsResponse,
  ListRationsResponse,
  SaveRationBody,
  SaveRationResponse,
} from '@workspace/api-zod';

import { requireApproved } from '../middlewares/requireApproved';
import { requireFarm } from '../middlewares/requireFarm';
import { addFarmFeed, feedReference, listFarmFeeds, listRations, removeFarmFeed, removeRation, saveRation } from '../lib/feedPlanner';
import { badRequest, handle, idParam, notFound } from './farmRouteHelpers';

// Futterplaner: the feed list (same for everyone) and a farm's own feeds and
// rations (read: every member; write: caretaker or admin).

const router: IRouter = Router();

const referenceJson = GetFeedReferenceResponse.parse(feedReference());

router.get('/feeds/reference', requireApproved, (_req, res) => {
  res.set('Cache-Control', 'private, max-age=3600');
  res.json(referenceJson);
});

router.get(
  '/farms/:farmId/feeds',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(ListFarmFeedsResponse.parse(await listFarmFeeds(req.farm!.farmId)));
  }),
);

router.post(
  '/farms/:farmId/feeds',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = AddFarmFeedBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(AddFarmFeedResponse.parse(await addFarmFeed(req.farm!.farmId, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/feeds/:feedId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const feedId = idParam(req, 'feedId');
    if (feedId === null) return notFound(res);
    await removeFarmFeed(req.farm!.farmId, feedId);
    res.sendStatus(204);
  }),
);

router.get(
  '/farms/:farmId/rations',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(ListRationsResponse.parse(await listRations(req.farm!.farmId)));
  }),
);

router.put(
  '/farms/:farmId/rations',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = SaveRationBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(SaveRationResponse.parse(await saveRation(req.farm!.farmId, { ...body.data, items: body.data.items.map((i) => ({ feedKey: i.feedKey ?? undefined, feedId: i.feedId ?? undefined, grams: i.grams })) })));
  }),
);

router.delete(
  '/farms/:farmId/rations/:rationId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const rationId = idParam(req, 'rationId');
    if (rationId === null) return notFound(res);
    await removeRation(req.farm!.farmId, rationId);
    res.sendStatus(204);
  }),
);

export default router;
