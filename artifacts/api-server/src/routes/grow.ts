import { Router, type IRouter, type NextFunction, type Request, type Response } from 'express';
import {
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
  GetGrowOverviewResponse,
  GetGrowPlantResponse,
  ListGrowAccessResponse,
  SetGrowAccessBody,
  SetGrowAccessResponse,
  GetGrowWeatherResponse,
  SetGrowSettingsBody,
  SetGrowSettingsResponse,
  UpdateGrowBody,
  UpdateGrowPlantBody,
  UpdateGrowPlantResponse,
  UpdateGrowResponse,
} from '@workspace/api-zod';

import { requireApproved, requireOwner } from '../middlewares/requireApproved';
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
  listGrowAccess,
  plantDetail,
  setGrowSettings,
  setGrowUnlocked,
  updateGrow,
  updatePlant,
} from '../lib/grow';
import { checkPlant } from '../lib/growDiagnosis';
import { growWeather } from '../lib/growWeather';
import { badRequest, handle, idParam, notFound, withAiQuota } from './farmRouteHelpers';

// Grow (add-on, adults only): access, grows, plants, Tagebuch. Everything
// belongs to the signed-in account; the module must be unlocked by the owner
// and the age confirmed before any grow data is read or written.

const router: IRouter = Router();

/** Unlocked and age confirmed – else 403 with what is missing. */
async function requireGrow(req: Request, res: Response, next: NextFunction): Promise<void> {
  const access = await growAccess(req.user!.id, req.user!.isOwner);
  if (!access.unlocked) {
    res.status(403).json({ error: 'Das Grow-Modul ist für dieses Konto nicht freigeschaltet.' });
    return;
  }
  if (!access.ageConfirmed) {
    res.status(403).json({ error: 'Bitte bestätige zuerst, dass du volljährig bist.' });
    return;
  }
  res.locals.growAdults = access.adults;
  next();
}

const me = (req: Request) => req.user!.id;
const overview = (req: Request, res: Response) => growOverview(me(req), res.locals.growAdults as number);

router.get(
  '/grow/access',
  requireApproved,
  handle(async (req, res) => {
    res.json(GetGrowAccessResponse.parse(await growAccess(me(req), req.user!.isOwner)));
  }),
);

router.post(
  '/grow/access',
  requireApproved,
  handle(async (req, res) => {
    const body = ConfirmGrowAgeBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(ConfirmGrowAgeResponse.parse(await confirmAge(me(req), req.user!.isOwner, body.data.adults)));
  }),
);

router.put(
  '/grow/access',
  requireApproved,
  handle(async (req, res) => {
    const body = SetGrowSettingsBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    const access = await growAccess(me(req), req.user!.isOwner);
    if (!access.unlocked || !access.ageConfirmed) {
      res.status(403).json({ error: 'Bitte bestätige zuerst, dass du volljährig bist.' });
      return;
    }
    res.json(SetGrowSettingsResponse.parse(await setGrowSettings(me(req), req.user!.isOwner, body.data)));
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

router.post(
  '/grow/plants/:plantId/checks',
  requireApproved,
  requireGrow,
  handle(async (req, res) => {
    const id = idParam(req, 'plantId');
    if (id === null) return notFound(res);
    const body = CheckGrowPlantBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
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

router.get(
  '/admin/grow-access',
  requireOwner,
  handle(async (_req, res) => {
    res.json(ListGrowAccessResponse.parse(await listGrowAccess()));
  }),
);

router.put(
  '/admin/grow-access',
  requireOwner,
  handle(async (req, res) => {
    const body = SetGrowAccessBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(SetGrowAccessResponse.parse(await setGrowUnlocked(body.data.email, body.data.unlocked)));
  }),
);

export default router;
