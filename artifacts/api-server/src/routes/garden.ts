import { Router, type IRouter } from 'express';
import {
  AddHarvestBody,
  AddHarvestResponse,
  AddPlantingBody,
  ListHarvestsResponse,
  AnalyzeBedPhotoResponse,
  ApproveCropDraftResponse,
  ListCropDraftsResponse,
  RequestCropBody,
  RequestCropResponse,
  SuggestBedCornersResponse,
  SuggestPlantingBody,
  SuggestPlantingResponse,
  AddPlantingResponse,
  CreateBedBody,
  CreateBedResponse,
  CheckGardenEventParams,
  CheckGardenEventResponse,
  GetBedHistoryResponse,
  GetBedResponse,
  GetFrostWarningsResponse,
  GetGardenGoalsResponse,
  GetGardenPlanResponse,
  SaveGardenGoalsBody,
  SaveGardenGoalsResponse,
  GetGardenCalendarResponse,
  GetGardenCatalogResponse,
  ListBedsResponse,
  ListPlantingsResponse,
  RemoveBedPhotoResponse,
  SetBedPhotoBody,
  SetBedPhotoCornersBody,
  SetBedPhotoCornersResponse,
  SetBedPhotoResponse,
  UpdateBedBody,
  UpdateBedResponse,
} from '@workspace/api-zod';

import { requireApproved, requireOwner } from '../middlewares/requireApproved';
import { requireFarm } from '../middlewares/requireFarm';
import {
  createBed,
  deleteBed,
  getBed,
  listBeds,
  removeBedPhoto,
  setBedCorners,
  setBedPhoto,
  updateBed,
} from '../lib/gardenBeds';
import { fullCatalog } from '../lib/gardenCatalog';
import { approveCrop, listCropDrafts, loadApprovedCrops, rejectCrop, requestCrop } from '../lib/gardenCrops';
import { analyzeBedPhoto, suggestCorners, suggestPlanting } from '../lib/gardenAi';
import { addPlanting, listPlantings, removePlanting } from '../lib/gardenPlanner';
import { bedHistory, farmCalendar, farmFrostWarnings, setCheck } from '../lib/gardenCalendar';
import { berlinTodayKey } from '../lib/pushScheduler';
import { gardenPlan, getGoals, saveGoals } from '../lib/gardenAssistant';
import { addHarvest, listHarvests, removeHarvest } from '../lib/gardenHarvests';
import { badRequest, handle, idParam, notFound, withAiQuota } from './farmRouteHelpers';

// Beet-Architekt: the crop catalog (same for everyone) and the beds of a
// farm (read: every member; write: caretaker or admin).

const router: IRouter = Router();

router.get(
  '/garden/catalog',
  requireApproved,
  handle(async (_req, res) => {
    await loadApprovedCrops();
    res.set('Cache-Control', 'private, max-age=300');
    res.json(GetGardenCatalogResponse.parse(fullCatalog()));
  }),
);

// ── KI: new crops (draft by the AI, approved by the app owner) ───────────────

router.post(
  '/garden/crop-requests',
  requireApproved,
  handle(async (req, res) => {
    const body = RequestCropBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    const result = await requestCrop(req.user!.id, body.data, (run) => withAiQuota(req, res, 'garden', run));
    if (result) res.json(RequestCropResponse.parse(result));
  }),
);

router.get(
  '/garden/crop-drafts',
  requireOwner,
  handle(async (_req, res) => {
    res.json(ListCropDraftsResponse.parse(await listCropDrafts()));
  }),
);

router.post(
  '/garden/crop-drafts/:key/approve',
  requireOwner,
  handle(async (req, res) => {
    res.json(ApproveCropDraftResponse.parse(await approveCrop(String(req.params['key']))));
  }),
);

router.delete(
  '/garden/crop-drafts/:key',
  requireOwner,
  handle(async (req, res) => {
    await rejectCrop(String(req.params['key']));
    res.sendStatus(204);
  }),
);

router.get(
  '/farms/:farmId/beds',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(ListBedsResponse.parse(await listBeds(req.farm!.farmId)));
  }),
);

router.post(
  '/farms/:farmId/beds',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = CreateBedBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(CreateBedResponse.parse(await createBed(req.farm!.farmId, body.data)));
  }),
);

router.get(
  '/farms/:farmId/beds/:bedId',
  requireFarm('guest'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    if (bedId === null) return notFound(res);
    res.json(GetBedResponse.parse(await getBed(req.farm!.farmId, bedId)));
  }),
);

router.patch(
  '/farms/:farmId/beds/:bedId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    if (bedId === null) return notFound(res);
    const body = UpdateBedBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(UpdateBedResponse.parse(await updateBed(req.farm!.farmId, bedId, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/beds/:bedId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    if (bedId === null) return notFound(res);
    await deleteBed(req.farm!.farmId, bedId);
    res.sendStatus(204);
  }),
);

// ── Foto mit Pflanzraster ────────────────────────────────────────────────────

router.put(
  '/farms/:farmId/beds/:bedId/photo',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    if (bedId === null) return notFound(res);
    const body = SetBedPhotoBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(SetBedPhotoResponse.parse(await setBedPhoto(req.farm!.farmId, bedId, body.data.imageData, body.data.heading)));
  }),
);

router.delete(
  '/farms/:farmId/beds/:bedId/photo',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    if (bedId === null) return notFound(res);
    res.json(RemoveBedPhotoResponse.parse(await removeBedPhoto(req.farm!.farmId, bedId)));
  }),
);

router.put(
  '/farms/:farmId/beds/:bedId/photo-corners',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    if (bedId === null) return notFound(res);
    const body = SetBedPhotoCornersBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(SetBedPhotoCornersResponse.parse(await setBedCorners(req.farm!.farmId, bedId, body.data.corners)));
  }),
);

router.post(
  '/farms/:farmId/beds/:bedId/photo/corner-suggestion',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    if (bedId === null) return notFound(res);
    const farmId = req.farm!.farmId;
    await getBed(farmId, bedId);
    const result = await withAiQuota(req, res, 'garden', async () => ({ corners: await suggestCorners(farmId, bedId) }));
    if (result) res.json(SuggestBedCornersResponse.parse(result));
  }),
);

router.post(
  '/farms/:farmId/beds/:bedId/photo/analysis',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    if (bedId === null) return notFound(res);
    const farmId = req.farm!.farmId;
    const bed = await getBed(farmId, bedId);
    if (!bed.photoUrl) return void res.status(400).json({ error: 'Für dieses Beet gibt es noch kein Foto.' });
    const updated = await withAiQuota(req, res, 'garden', () => analyzeBedPhoto(farmId, bedId));
    if (updated) res.json(AnalyzeBedPhotoResponse.parse(updated));
  }),
);

// ── Raster-Planer ────────────────────────────────────────────────────────────

router.get(
  '/farms/:farmId/beds/:bedId/seasons/:season/plantings',
  requireFarm('guest'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    const season = idParam(req, 'season');
    if (bedId === null || season === null) return notFound(res);
    res.json(ListPlantingsResponse.parse(await listPlantings(req.farm!.farmId, bedId, season)));
  }),
);

router.post(
  '/farms/:farmId/beds/:bedId/seasons/:season/plantings',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    const season = idParam(req, 'season');
    if (bedId === null || season === null) return notFound(res);
    const body = AddPlantingBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(AddPlantingResponse.parse(await addPlanting(req.farm!.farmId, bedId, season, body.data)));
  }),
);

router.post(
  '/farms/:farmId/beds/:bedId/seasons/:season/suggestion',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    const season = idParam(req, 'season');
    if (bedId === null || season === null) return notFound(res);
    const body = SuggestPlantingBody.safeParse(req.body ?? {});
    if (!body.success) return badRequest(res);
    const farmId = req.farm!.farmId;
    await getBed(farmId, bedId);
    const proposal = await withAiQuota(req, res, 'garden', () => suggestPlanting(farmId, bedId, season, body.data.wishes));
    if (proposal) res.json(SuggestPlantingResponse.parse(proposal));
  }),
);

router.delete(
  '/farms/:farmId/plantings/:plantingId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const plantingId = idParam(req, 'plantingId');
    if (plantingId === null) return notFound(res);
    await removePlanting(req.farm!.farmId, plantingId);
    res.sendStatus(204);
  }),
);

// ── Kalender & Fruchtfolge ───────────────────────────────────────────────────

router.get(
  '/farms/:farmId/beds/:bedId/history',
  requireFarm('guest'),
  handle(async (req, res) => {
    const bedId = idParam(req, 'bedId');
    if (bedId === null) return notFound(res);
    res.json(GetBedHistoryResponse.parse(await bedHistory(req.farm!.farmId, bedId)));
  }),
);

router.get(
  '/farms/:farmId/garden/seasons/:season/calendar',
  requireFarm('guest'),
  handle(async (req, res) => {
    const season = idParam(req, 'season');
    if (season === null) return notFound(res);
    res.json(GetGardenCalendarResponse.parse(await farmCalendar(req.farm!.farmId, season)));
  }),
);

// ── Ernten ───────────────────────────────────────────────────────────────────

router.get(
  '/farms/:farmId/garden/seasons/:season/harvests',
  requireFarm('guest'),
  handle(async (req, res) => {
    const season = idParam(req, 'season');
    if (season === null) return notFound(res);
    res.json(ListHarvestsResponse.parse(await listHarvests(req.farm!.farmId, season)));
  }),
);

router.post(
  '/farms/:farmId/plantings/:plantingId/harvests',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const plantingId = idParam(req, 'plantingId');
    if (plantingId === null) return notFound(res);
    const body = AddHarvestBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(AddHarvestResponse.parse(await addHarvest(req.farm!.farmId, plantingId, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/harvests/:harvestId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const harvestId = idParam(req, 'harvestId');
    if (harvestId === null) return notFound(res);
    await removeHarvest(req.farm!.farmId, harvestId);
    res.sendStatus(204);
  }),
);

// ── Garten-Assistent ─────────────────────────────────────────────────────────

router.get(
  '/farms/:farmId/garden/goals',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(GetGardenGoalsResponse.parse(await getGoals(req.farm!.farmId)));
  }),
);

router.put(
  '/farms/:farmId/garden/goals',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = SaveGardenGoalsBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(SaveGardenGoalsResponse.parse(await saveGoals(req.farm!.farmId, body.data)));
  }),
);

router.get(
  '/farms/:farmId/garden/plan',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(GetGardenPlanResponse.parse(await gardenPlan(req.farm!.farmId)));
  }),
);

router.get(
  '/farms/:farmId/garden/frost-warnings',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(GetFrostWarningsResponse.parse(await farmFrostWarnings(req.farm!.farmId, berlinTodayKey())));
  }),
);

for (const [method, done] of [['put', true], ['delete', false]] as const) {
  router[method](
    '/farms/:farmId/plantings/:plantingId/checks/:kind',
    requireFarm('caretaker'),
    handle(async (req, res) => {
      const params = CheckGardenEventParams.safeParse(req.params);
      if (!params.success) return notFound(res);
      const seedUse = await setCheck(req.farm!.farmId, params.data.plantingId, params.data.kind, done);
      if (done) res.json(CheckGardenEventResponse.parse({ seedUse }));
      else res.sendStatus(204);
    }),
  );
}

export default router;
