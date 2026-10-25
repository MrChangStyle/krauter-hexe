import { Router, type IRouter } from 'express';
import {
  AddBeeFeedingBody,
  AddBeeHoneyBody,
  AddBeeInspectionBody,
  AddBeeTreatmentBody,
  CreateBeeColonyBody,
  GetBeeColonyResponse,
  GetBeeOverviewResponse,
  ListBeeSiteChecksResponse,
  RunBeeSiteCheckBody,
  SetBeeColonyPhotoBody,
  UpdateBeeColonyBody,
} from '@workspace/api-zod';

import { requireFarm } from '../middlewares/requireFarm';
import {
  addFeeding,
  addHoney,
  addInspection,
  addTreatment,
  beeOverview,
  colonyDetail,
  createColony,
  deleteColony,
  deleteEntry,
  updateColony,
  type BeeEntryKind,
} from '../lib/bees';
import { deleteSiteCheck, listSiteChecks, removeColonyPhoto, runSiteCheck, setColonyPhoto, siteCheckValues } from '../lib/beeSite';
import { badRequest, handle, idParam, notFound, withAiQuota } from './farmRouteHelpers';

// Bienen (docs/bienen.md). Reading: every member with the grant; writing:
// caretaker or admin; deleting a colony: admin.

const router: IRouter = Router();

router.get(
  '/farms/:farmId/bees',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(GetBeeOverviewResponse.parse(await beeOverview(req.farm!.farmId)));
  }),
);

router.post(
  '/farms/:farmId/bees',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = CreateBeeColonyBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(GetBeeColonyResponse.parse(await createColony(req.farm!.farmId, body.data)));
  }),
);

// ── Standort-Check (before /bees/:colonyId) ──────────────────────────────────

router.get(
  '/farms/:farmId/bees/site-checks',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(ListBeeSiteChecksResponse.parse(await listSiteChecks(req.farm!.farmId)));
  }),
);

router.post(
  '/farms/:farmId/bees/site-checks',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = RunBeeSiteCheckBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    // A wrong photo is refused before it counts as an AI request.
    const values = siteCheckValues(body.data);
    const farmId = req.farm!.farmId;
    const checks = await withAiQuota(req, res, 'farm', () => runSiteCheck(farmId, values));
    if (checks) res.status(201).json(ListBeeSiteChecksResponse.parse(checks));
  }),
);

router.delete(
  '/farms/:farmId/bees/site-checks/:checkId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const checkId = idParam(req, 'checkId');
    if (checkId === null) return notFound(res);
    res.json(ListBeeSiteChecksResponse.parse(await deleteSiteCheck(req.farm!.farmId, checkId)));
  }),
);

// ── Photo of a colony's stand ────────────────────────────────────────────────

router.put(
  '/farms/:farmId/bees/:colonyId/photo',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const colonyId = idParam(req, 'colonyId');
    if (colonyId === null) return notFound(res);
    const body = SetBeeColonyPhotoBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await setColonyPhoto(req.farm!.farmId, colonyId, body.data.imageData);
    res.json(GetBeeColonyResponse.parse(await colonyDetail(req.farm!.farmId, colonyId)));
  }),
);

router.delete(
  '/farms/:farmId/bees/:colonyId/photo',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const colonyId = idParam(req, 'colonyId');
    if (colonyId === null) return notFound(res);
    await removeColonyPhoto(req.farm!.farmId, colonyId);
    res.json(GetBeeColonyResponse.parse(await colonyDetail(req.farm!.farmId, colonyId)));
  }),
);

router.get(
  '/farms/:farmId/bees/:colonyId',
  requireFarm('guest'),
  handle(async (req, res) => {
    const colonyId = idParam(req, 'colonyId');
    if (colonyId === null) return notFound(res);
    res.json(GetBeeColonyResponse.parse(await colonyDetail(req.farm!.farmId, colonyId)));
  }),
);

router.put(
  '/farms/:farmId/bees/:colonyId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const colonyId = idParam(req, 'colonyId');
    if (colonyId === null) return notFound(res);
    const body = UpdateBeeColonyBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(GetBeeColonyResponse.parse(await updateColony(req.farm!.farmId, colonyId, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/bees/:colonyId',
  requireFarm('admin'),
  handle(async (req, res) => {
    const colonyId = idParam(req, 'colonyId');
    if (colonyId === null) return notFound(res);
    await deleteColony(req.farm!.farmId, colonyId);
    res.sendStatus(204);
  }),
);

const ENTRIES = {
  inspections: { body: AddBeeInspectionBody, add: addInspection },
  feedings: { body: AddBeeFeedingBody, add: addFeeding },
  treatments: { body: AddBeeTreatmentBody, add: addTreatment },
  honey: { body: AddBeeHoneyBody, add: addHoney },
} as const;

for (const [kind, entry] of Object.entries(ENTRIES)) {
  router.post(
    `/farms/:farmId/bees/:colonyId/${kind}`,
    requireFarm('caretaker'),
    handle(async (req, res) => {
      const colonyId = idParam(req, 'colonyId');
      if (colonyId === null) return notFound(res);
      const body = entry.body.safeParse(req.body);
      if (!body.success) return badRequest(res);
      const add = entry.add as (farmId: number, colonyId: number, input: typeof body.data) => ReturnType<typeof colonyDetail>;
      res.status(201).json(GetBeeColonyResponse.parse(await add(req.farm!.farmId, colonyId, body.data)));
    }),
  );
}

router.delete(
  '/farms/:farmId/bees/:colonyId/:kind/:entryId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const colonyId = idParam(req, 'colonyId');
    const entryId = idParam(req, 'entryId');
    const kind = req.params['kind'] as string;
    if (colonyId === null || entryId === null || !(kind in ENTRIES)) return notFound(res);
    res.json(GetBeeColonyResponse.parse(await deleteEntry(req.farm!.farmId, colonyId, kind as BeeEntryKind, entryId)));
  }),
);

export default router;
