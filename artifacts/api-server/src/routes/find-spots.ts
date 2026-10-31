import { Router, type IRouter } from 'express';
import {
  GetFindSpotOverviewQueryParams,
  GetFindSpotOverviewResponse,
  ListFindSpotsQueryParams,
  ListFindSpotsResponse, RecordFindSpotBody,
  RecordFindSpotResponse,
} from '@workspace/api-zod';

import { findSpotMap, findSpotOverview, recordFindSpot } from '../lib/findSpots';
import { getSettings } from '../lib/userSettings';
import { requireApproved } from '../middlewares/requireApproved';
import { badRequest, handle } from './farmRouteHelpers';

// Fundorte (docs/fundorte.md): the shared, anonymous and coarsened map of
// where a species of the archive was found.

const router: IRouter = Router();

router.get(
  '/find-spots',
  requireApproved,
  handle(async (req, res) => {
    const query = ListFindSpotsQueryParams.safeParse(req.query);
    if (!query.success) return badRequest(res);
    const map = await findSpotMap(query.data.kind, query.data.speciesId);
    if (!map) {
      res.status(404).json({ error: 'Diese Art gibt es im Archiv nicht.' });
      return;
    }
    res.json(ListFindSpotsResponse.parse(map));
  }),
);

// Lexikon → Karte: all scans (plants, mushrooms, insects) with a find on one map – the caller's own or everyone's shared.
router.get(
  '/find-spots/overview',
  requireApproved,
  handle(async (req, res) => {
    const query = GetFindSpotOverviewQueryParams.safeParse(req.query);
    if (!query.success) return badRequest(res);
    const overview = await findSpotOverview(query.data.scope === 'mine' ? req.user!.id : null);
    res.json(GetFindSpotOverviewResponse.parse(overview));
  }),
);

router.post(
  '/find-spots',
  requireApproved,
  handle(async (req, res) => {
    const body = RecordFindSpotBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    const { shareFindSpots } = await getSettings(req.user!.id);
    const saved = await recordFindSpot(req.user!.id, shareFindSpots, body.data);
    res.json(RecordFindSpotResponse.parse({ saved }));
  }),
);

export default router;
