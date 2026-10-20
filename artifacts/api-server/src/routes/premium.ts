import { Router, type IRouter } from 'express';
import { GetPremiumResponse, ListPremiumResponse, SetPremiumBody, SetPremiumResponse } from '@workspace/api-zod';

import { requireApproved, requireOwner } from '../middlewares/requireApproved';
import { listPremium, premiumOf, setPremium } from '../lib/premium';
import { badRequest, handle } from './farmRouteHelpers';

// Premium: the account's own status, and the owner granting it by hand until
// there are payments (docs/premium.md).

const router: IRouter = Router();

router.get(
  '/premium',
  requireApproved,
  handle(async (req, res) => {
    res.json(GetPremiumResponse.parse(await premiumOf(req.user!.id, req.user!.isOwner)));
  }),
);

router.get(
  '/admin/premium',
  requireOwner,
  handle(async (_req, res) => {
    res.json(ListPremiumResponse.parse(await listPremium()));
  }),
);

router.put(
  '/admin/premium',
  requireOwner,
  handle(async (req, res) => {
    const body = SetPremiumBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(SetPremiumResponse.parse(await setPremium(body.data)));
  }),
);

export default router;
