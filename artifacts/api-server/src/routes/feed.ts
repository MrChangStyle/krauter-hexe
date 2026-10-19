import { Router, type IRouter } from 'express';
import {
  AddFarmFeedBody,
  AddFarmFeedResponse,
  ApproveFeedRecipeResponse,
  BuyFeedBody,
  BuyFeedResponse,
  CountFeedStockBody,
  CountFeedStockResponse,
  CreateFeedRemindersResponse,
  GetFeedCalendarResponse,
  GetFeedReferenceResponse,
  GetFeedStockResponse,
  ListFarmFeedsResponse,
  ListFeedRecipeDraftsResponse,
  ListFeedRecipesResponse,
  ListRationsResponse,
  ReadFeedLabelBody,
  ReadFeedLabelResponse,
  RejectFeedRecipeResponse,
  SaveRationBody,
  SaveRationResponse,
  SubmitFeedRecipeBody,
  SubmitFeedRecipeResponse,
} from '@workspace/api-zod';

import { requireApproved, requireOwner } from '../middlewares/requireApproved';
import { requireFarm } from '../middlewares/requireFarm';
import { checkImage } from '../lib/farmAi';
import { feedCalendar } from '../lib/feedCalendar';
import { berlinDay } from '../lib/monitoring';
import { readFeedLabel } from '../lib/feedLabel';
import { deleteRecipe, listRecipeDrafts, listRecipes, reviewRecipe, submitRecipe } from '../lib/feedRecipes';
import { buyFeed, countStock, feedStock, removeStock } from '../lib/feedStock';
import { addFarmFeed, feedReference, feedReminders, listFarmFeeds, listRations, removeFarmFeed, removeRation, saveRation } from '../lib/feedPlanner';
import { badRequest, handle, idParam, notFound, withAiQuota } from './farmRouteHelpers';

// Futterplaner: the feed list (same for everyone) and a farm's own feeds and
// rations (read: every member; write: caretaker or admin). Reading a label
// with the AI counts against the farm's daily AI limit and saves nothing.

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

router.post(
  '/farms/:farmId/feeds/label',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = ReadFeedLabelBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    checkImage(body.data.imageData);
    const reading = await withAiQuota(req, res, 'farm', () => readFeedLabel(body.data.imageData));
    if (reading) res.json(ReadFeedLabelResponse.parse(reading));
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

router.post(
  '/farms/:farmId/rations/:rationId/reminders',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const rationId = idParam(req, 'rationId');
    if (rationId === null) return notFound(res);
    res.json(CreateFeedRemindersResponse.parse(await feedReminders(req.farm!.farmId, rationId)));
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

// Vorrat und Kosten (Premium, marked in the app; no lock while there is no payment).

router.get(
  '/farms/:farmId/feed-stock',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(GetFeedStockResponse.parse(await feedStock(req.farm!.farmId)));
  }),
);

router.put(
  '/farms/:farmId/feed-stock',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = CountFeedStockBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(CountFeedStockResponse.parse(await countStock(req.farm!.farmId, body.data)));
  }),
);

router.post(
  '/farms/:farmId/feed-stock/purchase',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = BuyFeedBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(BuyFeedResponse.parse(await buyFeed(req.farm!.farmId, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/feed-stock/:stockId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const stockId = idParam(req, 'stockId');
    if (stockId === null) return notFound(res);
    await removeStock(req.farm!.farmId, stockId);
    res.sendStatus(204);
  }),
);

// Tipps und Rezepte: recipes for everyone (sent-in ones after the app owner's
// approval) and the fodder calendar of a farm's garden.

router.get(
  '/feed-recipes',
  requireApproved,
  handle(async (req, res) => {
    res.json(ListFeedRecipesResponse.parse(await listRecipes(req.user!.id)));
  }),
);

router.post(
  '/feed-recipes',
  requireApproved,
  handle(async (req, res) => {
    const body = SubmitFeedRecipeBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(SubmitFeedRecipeResponse.parse(await submitRecipe(req.user!.id, body.data)));
  }),
);

router.delete(
  '/feed-recipes/:recipeId',
  requireApproved,
  handle(async (req, res) => {
    await deleteRecipe(String(req.params['recipeId']), { id: req.user!.id, isOwner: !!req.user!.isOwner });
    res.sendStatus(204);
  }),
);

router.get(
  '/admin/feed-recipes',
  requireOwner,
  handle(async (_req, res) => {
    res.json(ListFeedRecipeDraftsResponse.parse(await listRecipeDrafts()));
  }),
);

router.post(
  '/admin/feed-recipes/:recipeId/approve',
  requireOwner,
  handle(async (req, res) => {
    res.json(ApproveFeedRecipeResponse.parse(await reviewRecipe(String(req.params['recipeId']), true)));
  }),
);

router.post(
  '/admin/feed-recipes/:recipeId/reject',
  requireOwner,
  handle(async (req, res) => {
    res.json(RejectFeedRecipeResponse.parse(await reviewRecipe(String(req.params['recipeId']), false)));
  }),
);

router.get(
  '/farms/:farmId/feed-calendar',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(GetFeedCalendarResponse.parse(await feedCalendar(req.farm!.farmId, Number(berlinDay().slice(0, 4)))));
  }),
);

export default router;
