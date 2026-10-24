import { Router, type IRouter } from 'express';
import { SearchQueryParams, SearchResponse } from '@workspace/api-zod';

import { search } from '../lib/search';
import { requireApproved } from '../middlewares/requireApproved';
import { badRequest, handle } from './farmRouteHelpers';

// Suche (docs/suche.md): archive and the active farm in one box.

const router: IRouter = Router();

router.get(
  '/search',
  requireApproved,
  handle(async (req, res) => {
    const query = SearchQueryParams.safeParse(req.query);
    if (!query.success) return badRequest(res);
    const farmId = query.data.farmId;
    const farm = farmId !== undefined && Number.isInteger(farmId) && farmId > 0 && farmId < 2 ** 31 ? farmId : null;
    res.set('Cache-Control', 'no-store').json(SearchResponse.parse({ groups: await search(req.user!.id, query.data.q, farm) }));
  }),
);

export default router;
