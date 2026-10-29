import { Router, type IRouter, type NextFunction, type Request, type Response } from 'express';
import {
  AddGrowCostBody,
  AddGrowCostResponse,
  AddGrowLogBody,
  CheckGrowPlantBody,
  CheckGrowPlantResponse,
  AddGrowPlantBody,
  AddGrowPlantResponse,
  ConfirmGrowAgeBody,
  ConfirmGrowAgeResponse,
  CreateGrowBody,
  CreateGrowResponse,
  GetGrowAccessResponse,
  GetGrowCostsResponse,
  GetGrowOverviewResponse,
  GetGrowPlantResponse,
  GetGrowWeatherResponse,
  SetGrowSettingsBody,
  SetGrowSettingsResponse,
  UpdateGrowBody,
  UpdateGrowPlantBody,
  UpdateGrowPlantResponse,
  UpdateGrowResponse,
} from '@workspace/api-zod';

import { requireApproved } from '../middlewares/requireApproved';
import {
  addLog,
  addPlant,
  confirmAge,
  createGrow,
  deleteGrow,
  deleteCheck,
  deleteLog,
  deletePlant,
  growAccess,
  growOverview,
  plantDetail,
  setGrowSettings,
  updateGrow,
  updatePlant,
} from '../lib/grow';
import { addCost, deleteCost, growCosts } from '../lib/growCosts';
import { checkPlant } from '../lib/growDiagnosis';
import { growWeather } from '../lib/growWeather';
import { premiumOf } from '../lib/premium';
import { badRequest, handle, idParam, notFound, withAiQuota } from './farmRouteHelpers';

// Grow (adults only): access, grows, plants, Tagebuch, weather, costs and the
// KI-Check. Everything belongs to the signed-in account; the age must be
// confirmed before any grow data is read or written. Free except the AI, which
// is Premium (lib/premium.ts).

const router: IRouter = Router();

/** Age confirmed – else 403. */
async function requireGrow(req: Request, res: Response, next: NextFunction): Promise<void> {
  const access = await growAccess(req.user!.id);
  if (!access.ageConfirmed) {
    res.status(403).json({ error: 'Bitte bestätige zuerst, dass du volljährig bist.' });
    return;
  }
  res.locals.growAdults = access.adults;
  res.locals.growKwhPrice = access.kwhPrice;
  next();
}

const me = (req: Request) => req.user!.id;
const overview = (req: Request, res: Response) => growOverview(me(req), res.locals.growAdults as number);

router.get(
  '/grow/access',
  requireApproved,
  handle(async (req, res) => {
    res.json(GetGrowAccessResponse.parse(await growAccess(me(req))));
  }),
);

router.post(
  '/grow/access',
  requireApproved,
  handle(async (req, res) => {
    const body = ConfirmGrowAgeBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(ConfirmGrowAgeResponse.parse(await confirmAge(me(req), body.data.adults)));
  }),
);

router.put(
  '/grow/access',
  requireApproved,
  handle(async (req, res) => {
    const body = SetGrowSettingsBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    const access = await growAccess(me(req));
    if (!access.ageConfirmed) {
      res.status(403).json({ error: 'Bitte bestätige zuerst, dass du volljährig bist.' });
      return;
    }
    res.json(SetGrowSettingsResponse.parse(await setGrowSettings(me(req), body.data)));
  }),
);

router.get(
  '/grow',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    res.json(GetGrowOverviewResponse.parse(await overview(req, res)));
  }),
);

router.post(
  '/grow/grows',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const body = CreateGrowBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await createGrow(me(req), body.data);
    res.status(201).json(CreateGrowResponse.parse(await overview(req, res)));
  }),
);

router.put(
  '/grow/grows/:growId',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const id = idParam(req, 'growId');
    if (id === null) return notFound(res);
    const body = UpdateGrowBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await updateGrow(me(req), id, body.data);
    res.json(UpdateGrowResponse.parse(await overview(req, res)));
  }),
);

router.delete(
  '/grow/grows/:growId',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const id = idParam(req, 'growId');
    if (id === null) return notFound(res);
    await deleteGrow(me(req), id);
    res.sendStatus(204);
  }),
);

router.get(
  '/grow/grows/:growId/weather',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const id = idParam(req, 'growId');
    if (id === null) return notFound(res);
    res.json(GetGrowWeatherResponse.parse(await growWeather(me(req), id)));
  }),
);

router.post(
  '/grow/grows/:growId/plants',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const id = idParam(req, 'growId');
    if (id === null) return notFound(res);
    const body = AddGrowPlantBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(AddGrowPlantResponse.parse(await addPlant(me(req), id, body.data)));
  }),
);

router.get(
  '/grow/plants/:plantId',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const id = idParam(req, 'plantId');
    if (id === null) return notFound(res);
    res.json(GetGrowPlantResponse.parse(await plantDetail(me(req), id)));
  }),
);

router.put(
  '/grow/plants/:plantId',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const id = idParam(req, 'plantId');
    if (id === null) return notFound(res);
    const body = UpdateGrowPlantBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(UpdateGrowPlantResponse.parse(await updatePlant(me(req), id, body.data)));
  }),
);

router.delete(
  '/grow/plants/:plantId',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const id = idParam(req, 'plantId');
    if (id === null) return notFound(res);
    await deletePlant(me(req), id);
    res.sendStatus(204);
  }),
);

router.post(
  '/grow/plants/:plantId/logs',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const id = idParam(req, 'plantId');
    if (id === null) return notFound(res);
    const body = AddGrowLogBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await addLog(me(req), id, body.data);
    res.sendStatus(204);
  }),
);

router.delete(
  '/grow/logs/:logId',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const id = idParam(req, 'logId');
    if (id === null) return notFound(res);
    await deleteLog(me(req), id);
    res.sendStatus(204);
  }),
);

router.get(
  '/grow/grows/:growId/costs',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const id = idParam(req, 'growId');
    if (id === null) return notFound(res);
    res.json(GetGrowCostsResponse.parse(await growCosts(me(req), id, res.locals.growKwhPrice as number | null)));
  }),
);

router.post(
  '/grow/grows/:growId/costs',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const id = idParam(req, 'growId');
    if (id === null) return notFound(res);
    const body = AddGrowCostBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await addCost(me(req), id, body.data);
    res.status(201).json(AddGrowCostResponse.parse(await growCosts(me(req), id, res.locals.growKwhPrice as number | null)));
  }),
);

router.delete(
  '/grow/costs/:costId',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const id = idParam(req, 'costId');
    if (id === null) return notFound(res);
    await deleteCost(me(req), id);
    res.sendStatus(204);
  }),
);

router.post(
  '/grow/plants/:plantId/checks',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const id = idParam(req, 'plantId');
    if (id === null) return notFound(res);
    const body = CheckGrowPlantBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    // Grow's AI check belongs to Premium, not Lite (docs/bezahlung.md).
    const premium = await premiumOf(me(req), req.user!.isOwner);
    if (!premium.active || premium.tier === 'lite') {
      res.status(402).json({ error: 'Der KI-Check gehört zu Premium.', premium: false });
      return;
    }
    const check = await withAiQuota(req, res, 'grow', () => checkPlant(me(req), id, body.data.kind, body.data.imageData));
    if (check) res.status(201).json(CheckGrowPlantResponse.parse(check));
  }),
);

router.delete(
  '/grow/checks/:checkId',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const id = idParam(req, 'checkId');
    if (id === null) return notFound(res);
    await deleteCheck(me(req), id);
    res.sendStatus(204);
  }),
);

export default router;
